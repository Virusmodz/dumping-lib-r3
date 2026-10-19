// ============================================================================
// Dumping LIB R3 — WebAssembly Edition (v2)
// Adapted from the original CLI tool "Dumping LIB R3" (elf_types_bd.cpp).
//
// Changes vs. the original:
//   - std::filesystem / std::cin replaced by an in-memory byte-buffer API
//     (the browser supplies the .so file via drag & drop / file picker).
//   - std::ofstream output replaced by a returned C string (dump.cpp text).
//   - Extra: structured JSON result (stats + classes + methods + offsets)
//     so the web UI can render an interactive class explorer.
//
// v2 additions (browser-edition features):
//   - Mangled names retained alongside demangled names (for IDA export).
//   - Global variables (STT_OBJECT) with sizes.
//   - Vtable reconstruction for Itanium-ABI shared libraries:
//     walks _ZTV* symbols, resolves relocation entries (S+A for RELA,
//     addend for R_*_RELATIVE) and raw pointer fallback to rebuild the
//     virtual dispatch table with resolved function names.
//
// v3: dump.cpp now uses the popular "offset-dump" layout (VirusModz style):
//   - class blocks in ASCII order, "::Global" bucket first
//   - one comment line per entry: Offset | Size | Type | Mangled
//   - OBJECT entries rendered as "static void* name; // [Data Field]"
//   - scope split: last "::" before the first "(" of the demangled name;
//     no "::" there -> "::Global" (vtable/typeinfo/thunk entries naturally
//     form their own "class vtable for <ns>" / "class <ret> <ns>" blocks)
//   - entries sorted by ascending offset inside every class block
//   - the file name is passed in so "// Binary:" can be written
// ============================================================================

#include <cstdint>
#include <cstring>
#include <cstdio>
#include <cstdlib>
#include <string>
#include <vector>
#include <map>
#include <set>
#include <algorithm>
#include <sstream>
#include <istream>
#include <cxxabi.h>

#include "elfio.hpp"

// ---------------------------------------------------------------------------
// Zero-copy memory stream: lets ELFIO read directly from the wasm heap buffer
// supplied by JavaScript (no intermediate file, no filesystem access).
// ---------------------------------------------------------------------------
class memistream : public std::istream {
    class membuf : public std::streambuf {
    public:
        membuf(const char* base, size_t size) {
            // ELFIO only reads; const_cast is safe for istream plumbing
            char* p = const_cast<char*>(base);
            this->setg(p, p, p + size);
        }

    protected:
        // Required: default streambuf seek functions fail, which would put
        // the stream into a fail state and break ELFIO's seekg() calls.
        std::streampos seekoff(std::streamoff off, std::ios_base::seekdir way,
                               std::ios_base::openmode which) override {
            if (!(which & std::ios_base::in)) return -1;
            char* whence = gptr();
            switch (way) {
                case std::ios_base::beg: whence = eback(); break;
                case std::ios_base::cur: whence = gptr();  break;
                case std::ios_base::end: whence = egptr(); break;
                default: return -1;
            }
            char* target = whence + off;
            if (target < eback() || target > egptr()) return -1;
            setg(eback(), target, egptr());
            return target - eback();
        }

        std::streampos seekpos(std::streampos pos,
                               std::ios_base::openmode which) override {
            return seekoff(static_cast<std::streamoff>(pos),
                           std::ios_base::beg, which);
        }
    };
    membuf buf_;

public:
    memistream(const uint8_t* data, size_t size)
        : std::istream(nullptr), buf_(reinterpret_cast<const char*>(data), size) {
        this->rdbuf(&buf_);
    }
};

// ---------------------------------------------------------------------------
// Persistent result storage (single-shot synchronous tool)
// ---------------------------------------------------------------------------
static std::string g_dump;     // dump.cpp text (identical format to the CLI)
static std::string g_json;     // structured JSON for the web UI
static std::string g_error;    // last error message

// ---------------------------------------------------------------------------
// JSON helper: escape a string for embedding into JSON output
// ---------------------------------------------------------------------------
static std::string json_escape(const std::string& s) {
    std::string out;
    out.reserve(s.size() + 8);
    for (unsigned char c : s) {
        switch (c) {
            case '"':  out += "\\\""; break;
            case '\\': out += "\\\\"; break;
            case '\b': out += "\\b";  break;
            case '\f': out += "\\f";  break;
            case '\n': out += "\\n";  break;
            case '\r': out += "\\r";  break;
            case '\t': out += "\\t";  break;
            default:
                if (c < 0x20) {
                    char esc[8];
                    snprintf(esc, sizeof(esc), "\\u%04x", c);
                    out += esc;
                } else {
                    out += static_cast<char>(c);
                }
        }
    }
    return out;
}

// ---------------------------------------------------------------------------
// Demangle — same as the original tool (abi::__cxa_demangle, fallback to
// the mangled name when demangling fails, e.g. plain C symbols)
// ---------------------------------------------------------------------------
static std::string demangle(const std::string& mangled) {
    int status = 0;
    char* demangled = abi::__cxa_demangle(mangled.c_str(), nullptr, nullptr, &status);
    std::string result = (status == 0 && demangled) ? demangled : mangled;
    free(demangled);
    return result;
}

// ---------------------------------------------------------------------------
// Offset-dump scope split (v3):
//   boundary = first '(' in the demangled name (or the end when absent)
//   scope    = everything before the LAST "::" occurring at/before boundary
// When no "::" exists there the symbol is a free/global entry and lands in
// the "::Global" bucket. Consequences of this simple rule (all intentional,
// they reproduce the reference dumps exactly):
//   - "vtable for ns::Class"      -> class "vtable for ns",  entry "Class"
//   - "typeinfo for ns::Class"    -> class "typeinfo for ns", entry "Class"
//   - "thunk to ns::Cls::Method()" -> class "thunk to ns::Cls", entry "Method()"
//   - "Ret ns::Cls::tpl<int>()"   -> class "Ret ns::Cls", entry "tpl<int>()"
//   - "freeFn(ns::Type&)"         -> ::Global, full demangled name
// ---------------------------------------------------------------------------
static void vm_split(const std::string& dem, std::string& cls, std::string& entry) {
    const size_t paren = dem.find('(');
    const size_t boundary = (paren == std::string::npos) ? dem.size() : paren;
    const size_t pos = dem.rfind("::", boundary);
    if (pos != std::string::npos) {
        cls = dem.substr(0, pos);
        entry = dem.substr(pos + 2);
    } else {
        cls = "::Global";
        entry = dem;
    }
}

// ---------------------------------------------------------------------------
// Collected symbol data
// ---------------------------------------------------------------------------
struct FuncSym {
    std::string dem;   // demangled name
    std::string man;   // mangled name
    unsigned long long addr;
    unsigned long long size;
};

struct ObjSym {
    std::string dem;
    std::string man;
    unsigned long long addr;
    unsigned long long size;
};

struct VtSlot {
    unsigned long long slot;    // virtual address of the slot itself
    unsigned long long target;  // resolved target address (0 if unresolved)
    std::string name;           // resolved function name (or import name)
};

struct VtSym {
    std::string cls;    // demangled class name
    std::string man;    // mangled _ZTV... name
    unsigned long long addr;
    unsigned long long size;
    std::string rtti;   // resolved typeinfo name (slot 1)
    std::vector<VtSlot> slots;
};

// ---------------------------------------------------------------------------
// Analyze an ELF image living in memory.
// Mirrors b() in the original elf_types_bd.cpp, plus structured output.
// ---------------------------------------------------------------------------
extern "C" int wasm_analyze(const uint8_t* data, size_t size, const char* file_name) {
    g_dump.clear();
    g_json.clear();
    g_error.clear();

    try {
        memistream stream(data, size);
        ELFIO::elfio reader;
        if (!reader.load(stream)) {
            g_error = "Failed to load ELF file (not a valid ELF image or unsupported class/endianness)";
            return 1;
        }

        // --- header metadata for the UI -----------------------------------
        const unsigned char elf_class    = reader.get_class();      // 1 = 32-bit, 2 = 64-bit
        const unsigned char elf_endian   = reader.get_encoding();   // 1 = LE, 2 = BE
        const unsigned int  elf_type     = reader.get_type();       // ET_EXEC / ET_DYN ...
        const unsigned int  elf_machine  = reader.get_machine();    // EM_ARM / EM_AARCH64 ...
        const unsigned int  elf_flags    = reader.get_flags();
        const size_t        word         = (elf_class == 2) ? 8 : 4; // pointer size in bytes

        char machine_name[64] = {0};
        switch (elf_machine) {
            case 0:  snprintf(machine_name, sizeof(machine_name), "EM_NONE"); break;
            case 3:  snprintf(machine_name, sizeof(machine_name), "EM_386 (x86)"); break;
            case 8:  snprintf(machine_name, sizeof(machine_name), "EM_MIPS"); break;
            case 40: snprintf(machine_name, sizeof(machine_name), "EM_ARM (32-bit ARM)"); break;
            case 62: snprintf(machine_name, sizeof(machine_name), "EM_X86_64"); break;
            case 183:snprintf(machine_name, sizeof(machine_name), "EM_AARCH64 (ARM64)"); break;
            case 243:snprintf(machine_name, sizeof(machine_name), "EM_RISCV"); break;
            default: snprintf(machine_name, sizeof(machine_name), "EM_%u", elf_machine); break;
        }

        // --- symbol scan — identical iteration to the original tool -------
        std::vector<FuncSym> funcs;
        std::vector<ObjSym>  objects;
        std::set<std::string> seen;                       // dedup (mangled:addr) across symtab+dynsym
        std::map<unsigned long long, std::string> symByAddr; // addr -> mangled name (any type)
        size_t symbol_count = 0;

        for (const auto& section : reader.sections) {
            if (section->get_type() == ELFIO::SHT_SYMTAB ||
                section->get_type() == ELFIO::SHT_DYNSYM) {
                ELFIO::symbol_section_accessor symbols(reader, section.get());
                for (unsigned int i = 0; i < symbols.get_symbols_num(); ++i) {
                    std::string name;
                    ELFIO::Elf64_Addr value;
                    ELFIO::Elf_Xword size;
                    unsigned char bind, type, other;
                    ELFIO::Elf_Half section_index;

                    if (!symbols.get_symbol(i, name, value, size, bind, type,
                                            section_index, other)) {
                        continue;
                    }
                    ++symbol_count;
                    if (name.empty() || value == 0) continue;

                    char key[48];
                    snprintf(key, sizeof(key), ":%llx",
                             static_cast<unsigned long long>(value));
                    std::string dedup = name + key;

                    if (type == ELFIO::STT_FUNC) {
                        if (seen.insert(dedup).second) {
                            funcs.push_back({demangle(name), name,
                                             (unsigned long long)value,
                                             (unsigned long long)size});
                        }
                    } else if (type == ELFIO::STT_OBJECT) {
                        if (seen.insert(dedup).second) {
                            objects.push_back({demangle(name), name,
                                               (unsigned long long)value,
                                               (unsigned long long)size});
                        }
                    }
                    // address -> mangled (first definition wins)
                    if (!symByAddr.count((unsigned long long)value)) {
                        symByAddr[(unsigned long long)value] = name;
                    }
                }
            }
        }

        // --- offset-dump master grouping (v3) ------------------------------
        // Every FUNC + OBJECT entry (vtable/typeinfo machinery included) is
        // split with vm_split; std::map keeps classes in ASCII order, which
        // naturally puts "::Global" first (':' < 'A' < ... < 'a').
        struct DumpEntry {
            std::string name;   // entry name (class scope stripped)
            std::string man;    // mangled name
            unsigned long long addr;
            unsigned long long size;
            bool isFunc;
        };
        std::map<std::string, std::vector<DumpEntry>> vmClasses;

        // class grouping for the interactive explorer — same split rule as
        // the dump text so both views always agree
        std::map<std::string, std::vector<const FuncSym*>> classFuncs;
        std::vector<const FuncSym*> free_funcs;

        for (const auto& f : funcs) {
            std::string cls, entry;
            vm_split(f.dem, cls, entry);
            vmClasses[cls].push_back({entry, f.man, f.addr, f.size, true});
            if (cls == "::Global") {
                free_funcs.push_back(&f);
            } else {
                classFuncs[cls].push_back(&f);
            }
        }
        for (const auto& o : objects) {
            std::string cls, entry;
            vm_split(o.dem, cls, entry);
            vmClasses[cls].push_back({entry, o.man, o.addr, o.size, false});
        }

        // plain globals: objects that are not vtable/typeinfo machinery
        auto is_vtable_machinery = [](const std::string& man) {
            return man.rfind("_ZTV", 0) == 0 || man.rfind("_ZTI", 0) == 0 ||
                   man.rfind("_ZTS", 0) == 0 || man.rfind("_ZTT", 0) == 0 ||
                   man.rfind("_ZTh", 0) == 0 || man.rfind("_ZTv", 0) == 0;
        };
        std::vector<const ObjSym*> plain_globals;
        for (const auto& o : objects) {
            if (!is_vtable_machinery(o.man)) plain_globals.push_back(&o);
        }

        // sort entries by ascending offset (stable: ties keep table order,
        // e.g. C1/C2 constructor pairs sharing one address)
        for (auto& kv : vmClasses) {
            std::stable_sort(kv.second.begin(), kv.second.end(),
                             [](const DumpEntry& a, const DumpEntry& b) {
                                 return a.addr < b.addr;
                             });
        }
        for (auto& kv : classFuncs) {
            std::stable_sort(kv.second.begin(), kv.second.end(),
                             [](const FuncSym* a, const FuncSym* b) {
                                 return a->addr < b->addr;
                             });
        }

        // --- dump.cpp — offset-dump layout (VirusModz style) ----------------
        std::ostringstream out;
        out << "// Dump generated by Dumping LIB R3 (WebAssembly Edition)\n";
        out << "// Binary: " << (file_name ? file_name : "") << "\n\n";
        for (const auto& kv : vmClasses) {
            out << "// " << std::string(76, '=') << "\n";
            out << "class " << kv.first << " {\npublic:\n\n";
            for (const auto& e : kv.second) {
                char off[32], sz[32];
                snprintf(off, sizeof(off), "0x%llX", e.addr);
                snprintf(sz, sizeof(sz), "0x%llX", e.size);
                out << "    // Offset: " << off << " | Size: " << sz
                    << " | Type: " << (e.isFunc ? "FUNC" : "OBJECT")
                    << " | Mangled: " << e.man << "\n";
                if (e.isFunc) {
                    out << "    " << e.name << ";\n\n";
                } else {
                    out << "    static void* " << e.name
                        << "; // [Data Field]\n\n";
                }
            }
            out << "};\n\n";
        }
        g_dump = out.str();

        // --- vtable reconstruction ----------------------------------------
        // 1) address -> demangled function name
        std::map<unsigned long long, std::string> funcByAddr;
        for (const auto& f : funcs) {
            if (!funcByAddr.count(f.addr)) funcByAddr[f.addr] = f.dem;
        }

        // resolve an address to a human-readable symbol name ("" if unknown)
        auto resolve_addr = [&](unsigned long long a) -> std::string {
            auto it = funcByAddr.find(a);
            if (it != funcByAddr.end()) return it->second;
            auto sit = symByAddr.find(a);
            if (sit != symByAddr.end()) return demangle(sit->second);
            return "";
        };

        // 2) relocation map: patch vaddr -> (symbolName, computed target)
        //    target = symbolValue + addend (S + A); for R_*_RELATIVE the
        //    symbol is empty and addend holds the absolute address.
        std::map<unsigned long long, std::pair<std::string, long long>> relocAt;
        for (const auto& section : reader.sections) {
            if (section->get_type() == ELFIO::SHT_RELA ||
                section->get_type() == ELFIO::SHT_REL) {
                ELFIO::relocation_section_accessor relocs(reader, section.get());
                for (unsigned int i = 0; i < relocs.get_entries_num(); ++i) {
                    ELFIO::Elf64_Addr  offset = 0;
                    ELFIO::Elf64_Addr  symbolValue = 0;
                    std::string        symbolName;
                    unsigned           rtype = 0;
                    ELFIO::Elf_Sxword  addend = 0;
                    ELFIO::Elf_Sxword  calcValue = 0;
                    if (relocs.get_entry(i, offset, symbolValue, symbolName,
                                         rtype, addend, calcValue)) {
                        // strip symbol version suffix "name@@GLIBC_2.4"
                        std::string clean = symbolName;
                        size_t at = clean.find("@@");
                        if (at != std::string::npos) clean = clean.substr(0, at);
                        at = clean.find('@');
                        if (at != std::string::npos) clean = clean.substr(0, at);

                        long long target = 0;
                        if (!clean.empty() && symbolValue != 0) {
                            target = (long long)symbolValue + (long long)addend;
                        } else if (clean.empty()) {
                            target = (long long)addend; // R_*_RELATIVE style
                        }
                        relocAt[(unsigned long long)offset] = {clean, target};
                    }
                }
            }
        }

        // 3) raw pointer read helper (fallback for non-relocated images)
        auto file_offset_of = [&](unsigned long long vaddr) -> long long {
            for (const auto& s : reader.sections) {
                unsigned long long sa = (unsigned long long)s->get_address();
                unsigned long long ss = (unsigned long long)s->get_size();
                if (sa != 0 && vaddr >= sa && vaddr < sa + ss) {
                    return (long long)(s->get_offset() + (vaddr - sa));
                }
            }
            return -1;
        };
        auto read_ptr = [&](unsigned long long vaddr) -> unsigned long long {
            long long fo = file_offset_of(vaddr);
            if (fo < 0 || (size_t)(fo + word) > size) return 0;
            const uint8_t* p = data + fo;
            unsigned long long v = 0;
            if (elf_endian == 2) { // big endian
                for (size_t b = 0; b < word; ++b) v = (v << 8) | p[b];
            } else {               // little endian
                for (size_t b = word; b-- > 0;) v = (v << 8) | p[b];
            }
            return v;
        };

        // 4) walk every _ZTV* object symbol
        std::vector<VtSym> vtables;
        for (const auto& o : objects) {
            if (o.man.rfind("_ZTV", 0) != 0) continue;

            VtSym vt;
            vt.man  = o.man;
            vt.addr = o.addr;
            vt.size = o.size;

            // demangle gives "vtable for <Class>"; strip the prefix
            std::string full = demangle(o.man);
            const std::string pfx = "vtable for ";
            vt.cls = (full.rfind(pfx, 0) == 0) ? full.substr(pfx.size()) : full;

            // slot 1 = typeinfo pointer
            {
                auto rit = relocAt.find(vt.addr + word);
                if (rit != relocAt.end() && rit->second.second != 0) {
                    vt.rtti = resolve_addr((unsigned long long)rit->second.second);
                } else {
                    unsigned long long raw = read_ptr(vt.addr + word);
                    if (raw) vt.rtti = resolve_addr(raw);
                }
                if (vt.rtti.empty()) vt.rtti = "?";
            }

            // slots 2.. = virtual function pointers
            const size_t max_slots = vt.size > 0 ? (size_t)(vt.size / word) : 256;
            size_t consecutive_miss = 0;
            for (size_t k = 2; k < max_slots && consecutive_miss < 2; ++k) {
                unsigned long long slotAddr = vt.addr + k * word;
                unsigned long long target = 0;
                std::string name;
                bool found = false;

                auto rit = relocAt.find(slotAddr);
                if (rit != relocAt.end()) {
                    if (rit->second.second != 0) {
                        target = (unsigned long long)rit->second.second;
                        name = resolve_addr(target);
                        if (name.empty() && !rit->second.first.empty()) {
                            name = rit->second.first; // imported symbol
                        }
                    } else if (!rit->second.first.empty()) {
                        name = rit->second.first;    // undefined import
                    }
                    found = (target != 0 || !name.empty());
                }
                if (!found) {
                    // raw pointer fallback (statically linked executables)
                    unsigned long long raw = read_ptr(slotAddr);
                    if (raw != 0) {
                        std::string rn = resolve_addr(raw);
                        if (!rn.empty()) {
                            target = raw;
                            name = rn;
                            found = true;
                        }
                    }
                }

                if (found) {
                    consecutive_miss = 0;
                    vt.slots.push_back({slotAddr, target, name});
                } else {
                    ++consecutive_miss;
                }
            }
            vtables.push_back(std::move(vt));
        }

        // --- structured JSON for the web UI -------------------------------
        std::ostringstream js;
        js << "{"
           << "\"ok\":true,"
           << "\"fileSize\":" << size << ","
           << "\"elfClass\":" << static_cast<int>(elf_class) << ","
           << "\"elfEndian\":" << static_cast<int>(elf_endian) << ","
           << "\"elfType\":" << elf_type << ","
           << "\"elfMachine\":" << elf_machine << ","
           << "\"elfFlags\":" << elf_flags << ","
           << "\"machine\":\"" << json_escape(machine_name) << "\","
           << "\"symbolCount\":" << symbol_count << ","
           << "\"funcCount\":" << funcs.size() << ","
           << "\"classCount\":" << classFuncs.size() << ","
           << "\"dumpClassCount\":" << vmClasses.size() << ","
           << "\"freeFuncCount\":" << free_funcs.size() << ","
           << "\"objectCount\":" << plain_globals.size() << ","
           << "\"vtableCount\":" << vtables.size() << ","
           << "\"classes\":[";

        bool first_cls = true;
        for (const auto& kv : classFuncs) {
            if (!first_cls) js << ",";
            first_cls = false;
            js << "{\"name\":\"" << json_escape(kv.first) << "\",\"methods\":[";
            bool first_m = true;
            for (const auto* f : kv.second) {
                if (!first_m) js << ",";
                first_m = false;
                char off[32];
                snprintf(off, sizeof(off), "0x%llx", f->addr);
                std::string scope, meth;
                vm_split(f->dem, scope, meth);
                js << "{\"m\":\"" << json_escape(meth) << "\",\"mn\":\""
                   << json_escape(f->man) << "\",\"o\":\""
                   << off << "\",\"s\":" << f->size << "}";
            }
            js << "]}";
        }
        js << "],\"freeFuncs\":[";
        for (size_t i = 0; i < free_funcs.size(); ++i) {
            if (i) js << ",";
            char off[32];
            snprintf(off, sizeof(off), "0x%llx", free_funcs[i]->addr);
            js << "{\"m\":\"" << json_escape(free_funcs[i]->dem) << "\",\"mn\":\""
               << json_escape(free_funcs[i]->man) << "\",\"o\":\""
               << off << "\",\"s\":" << free_funcs[i]->size << "}";
        }
        js << "],\"objects\":[";
        for (size_t i = 0; i < plain_globals.size(); ++i) {
            if (i) js << ",";
            char off[32];
            snprintf(off, sizeof(off), "0x%llx", plain_globals[i]->addr);
            js << "{\"m\":\"" << json_escape(plain_globals[i]->dem) << "\",\"mn\":\""
               << json_escape(plain_globals[i]->man) << "\",\"o\":\""
               << off << "\",\"s\":" << plain_globals[i]->size << "}";
        }
        js << "],\"vtables\":[";
        for (size_t i = 0; i < vtables.size(); ++i) {
            const VtSym& vt = vtables[i];
            if (i) js << ",";
            char off[32];
            snprintf(off, sizeof(off), "0x%llx", vt.addr);
            js << "{\"cls\":\"" << json_escape(vt.cls) << "\",\"mn\":\""
               << json_escape(vt.man) << "\",\"o\":\"" << off << "\",\"s\":"
               << vt.size << ",\"rtti\":\"" << json_escape(vt.rtti)
               << "\",\"e\":[";
            for (size_t k = 0; k < vt.slots.size(); ++k) {
                if (k) js << ",";
                char so[32], to[32];
                snprintf(so, sizeof(so), "0x%llx", vt.slots[k].slot);
                snprintf(to, sizeof(to), "0x%llx", vt.slots[k].target);
                js << "{\"i\":" << (k + 2) << ",\"sa\":\"" << so
                   << "\",\"t\":\"" << to << "\",\"m\":\""
                   << json_escape(vt.slots[k].name) << "\"}";
            }
            js << "]}";
        }
        js << "]}";
        g_json = js.str();

        return 0;
    } catch (const std::exception& e) {
        g_error = std::string("Exception while parsing: ") + e.what();
        return 2;
    } catch (...) {
        g_error = "Unknown exception while parsing";
        return 3;
    }
}

// --- accessors consumed from JavaScript ------------------------------------
extern "C" const char* wasm_get_dump(void)  { return g_dump.c_str();  }
extern "C" const char* wasm_get_json(void)  { return g_json.c_str();  }
extern "C" const char* wasm_get_error(void) { return g_error.c_str(); }

// Version tag of the web edition (displayed in the UI)
extern "C" const char* wasm_get_version(void) { return "R3-wasm-3.0"; }
