// -----------------------------------------------------------------------------
// ELF Dumper — WebAssembly bridge (v2)
// Loads the Emscripten-compiled module (public/wasm/elf-dumper.js) and exposes
// a typed analyze() API that runs fully client-side.
//
// v2: analysis runs inside a Web Worker (public/workers/elf-worker.js) so the
// UI stays responsive on 200MB+ libraries; falls back to the main thread when
// workers are unavailable. Also adds global/vtable data and JSON/IDA export.
// -----------------------------------------------------------------------------

/** One symbol entry (function, global or free function). */
export interface ElfMethod {
  /** Demangled name (without class prefix for class methods). */
  m: string;
  /** Mangled name (useful for IDA import). */
  mn?: string;
  /** Symbol address, e.g. "0x1234". */
  o: string;
  /** Symbol size in bytes (0 when unknown). */
  s?: number;
}

export interface ElfClass {
  /** Fully-qualified demangled class name (e.g. "engine::render::Renderer"). */
  name: string;
  methods: ElfMethod[];
}

/** One resolved vtable slot. */
export interface VtEntry {
  /** Slot index (Itanium ABI: 0 = offset-to-top, 1 = typeinfo). */
  i: number;
  /** Virtual address of the slot itself. */
  sa: string;
  /** Resolved target address ("0x0" when unresolved). */
  t: string;
  /** Resolved function name (demangled). */
  m: string;
}

export interface ElfVtable {
  /** Demangled class name this vtable belongs to. */
  cls: string;
  /** Mangled symbol name (_ZTV...). */
  mn: string;
  /** Vtable address. */
  o: string;
  /** Vtable size in bytes. */
  s: number;
  /** Resolved typeinfo name (slot 1). */
  rtti: string;
  /** Resolved function slots. */
  e: VtEntry[];
}

export interface ElfAnalysis {
  ok: true;
  /** File size in bytes. */
  fileSize: number;
  /** 1 = ELF32, 2 = ELF64. */
  elfClass: number;
  /** 1 = little endian, 2 = big endian. */
  elfEndian: number;
  /** ELF file type (ET_EXEC=2, ET_DYN=3 ...). */
  elfType: number;
  /** ELF machine number. */
  elfMachine: number;
  /** ELF header flags. */
  elfFlags: number;
  /** Human-readable machine name. */
  machine: string;
  /** Total symbols scanned across SYMTAB + DYNSYM. */
  symbolCount: number;
  /** Unique function symbols found. */
  funcCount: number;
  /** Classes extracted (methods grouped by class path). */
  classCount: number;
  /** Class blocks in the generated dump.cpp (incl. ::Global, "vtable for …"). */
  dumpClassCount: number;
  /** Demangled functions that do not belong to any class. */
  freeFuncCount: number;
  /** Plain global variables (vtable machinery excluded). */
  objectCount: number;
  /** Vtables reconstructed. */
  vtableCount: number;
  classes: ElfClass[];
  freeFuncs: ElfMethod[];
  objects: ElfMethod[];
  vtables: ElfVtable[];
}

export interface AnalyzeSuccess {
  ok: true;
  fileName: string;
  fileSize: number;
  analysis: ElfAnalysis;
  /** The generated dump.cpp text — offset-dump layout (Offset | Size | Type | Mangled). */
  dump: string;
  /** Wall-clock parse time in milliseconds. */
  durationMs: number;
  /** Where the analysis ran: "worker" (preferred) or "main". */
  engine: 'worker' | 'main';
}

export interface AnalyzeFailure {
  ok: false;
  fileName: string;
  fileSize: number;
  error: string;
}

export type AnalyzeResult = AnalyzeSuccess | AnalyzeFailure;

/** Minimal shape of the Emscripten module we rely on. */
interface ElfDumperModule {
  _malloc(size: number): number;
  _free(ptr: number): void;
  _wasm_analyze(ptr: number, size: number, namePtr: number): number;
  _wasm_get_dump(): number;
  _wasm_get_json(): number;
  _wasm_get_error(): number;
  _wasm_get_version(): number;
  UTF8ToString(ptr: number): string;
  HEAPU8: Uint8Array;
}

type ModuleFactory = (opts: Record<string, unknown>) => Promise<ElfDumperModule>;

declare global {
  interface Window {
    ElfDumperModule?: ModuleFactory;
  }
}

// Base path for sub-path hosting (GitHub Pages project sites, etc.).
// Inlined at build time by Next.js from NEXT_PUBLIC_BASE_PATH.
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";

const WASM_BASE = `${BASE_PATH}/wasm`;
const WORKER_URL = `${BASE_PATH}/workers/elf-worker.js`;

// ============================================================================
// Worker manager (preferred engine)
// ============================================================================

interface WorkerResultMsg {
  type: 'result';
  id: number;
  fileName: string;
  fileSize: number;
  rc: number;
  json: string;
  dump: string;
  error: string;
  durationMs: number;
}

let worker: Worker | null = null;
let workerReady: Promise<Worker> | null = null;
let seq = 0;
const pending = new Map<number, (r: WorkerResultMsg) => void>();

function getWorker(): Promise<Worker> {
  if (!workerReady) {
    workerReady = new Promise<Worker>((resolve, reject) => {
      let w: Worker;
      try {
        w = new Worker(WORKER_URL);
      } catch (e) {
        reject(new Error(`Worker creation failed: ${(e as Error).message}`));
        return;
      }
      worker = w;

      const timeout = setTimeout(() => {
        reject(new Error('Worker initialization timed out'));
      }, 20000);
      const cleanup = () => clearTimeout(timeout);

      w.onmessage = (e: MessageEvent) => {
        const msg = e.data;
        if (!msg || typeof msg !== 'object') return;
        if (msg.type === 'ready') {
          cleanup();
          resolve(w);
        } else if (msg.type === 'init-error') {
          cleanup();
          reject(new Error(`Worker init failed: ${msg.error}`));
        } else if (msg.type === 'result') {
          const cb = pending.get(msg.id as number);
          if (cb) {
            pending.delete(msg.id as number);
            cb(msg as WorkerResultMsg);
          }
        }
      };
      w.onerror = () => {
        cleanup();
        // fail any queued analyses
        for (const [id, cb] of pending) {
          cb({
            type: 'result', id, fileName: '', fileSize: 0, rc: 4,
            json: '', dump: '', error: 'Worker crashed during analysis',
            durationMs: 0,
          });
          pending.delete(id);
        }
        reject(new Error('Worker error'));
        workerReady = null;
        worker = null;
      };

      w.postMessage({ type: 'init' });
    });
  }
  return workerReady;
}

// ============================================================================
// Main-thread module (fallback engine)
// ============================================================================

let modulePromise: Promise<ElfDumperModule> | null = null;

/** Inject the Emscripten glue script once; resolve the module factory. */
function loadGlueScript(): Promise<ModuleFactory> {
  return new Promise((resolve, reject) => {
    if (window.ElfDumperModule) {
      resolve(window.ElfDumperModule);
      return;
    }
    const script = document.createElement('script');
    script.src = `${WASM_BASE}/elf-dumper.js`;
    script.async = true;
    script.onload = () => {
      if (window.ElfDumperModule) resolve(window.ElfDumperModule);
      else reject(new Error('elf-dumper.js loaded but ElfDumperModule was not defined'));
    };
    script.onerror = () => reject(new Error(`Failed to load ${WASM_BASE}/elf-dumper.js`));
    document.head.appendChild(script);
  });
}

/** Lazily instantiate the main-thread WASM module (cached across calls). */
function getDumperModule(): Promise<ElfDumperModule> {
  if (!modulePromise) {
    modulePromise = (async () => {
      const factory = await loadGlueScript();
      return factory({
        locateFile: (path: string) =>
          path.startsWith('/') ? path : `${WASM_BASE}/${path}`,
      });
    })();
  }
  return modulePromise;
}

// ============================================================================
// Public API
// ============================================================================

/** Pre-warm the worker (or main-thread module as fallback). */
export function preloadDumper(): void {
  getWorker().catch(() => {
    getDumperModule().catch(() => {
      /* surfaced later on real use */
    });
  });
}

/** Write a JS string into the wasm heap as a NUL-terminated C string. */
function writeCString(mod: ElfDumperModule, s: string): number {
  const bytes = new TextEncoder().encode(String(s || ''));
  const ptr = mod._malloc(bytes.length + 1);
  if (!ptr) throw new Error('Out of memory allocating the filename buffer');
  mod.HEAPU8.set(bytes, ptr);
  mod.HEAPU8[ptr + bytes.length] = 0;
  return ptr;
}

/** Analyze bytes on the main thread (fallback path). */
async function analyzeOnMainThread(
  fileName: string,
  bytes: Uint8Array
): Promise<AnalyzeResult> {
  let mod: ElfDumperModule;
  try {
    mod = await getDumperModule();
  } catch (e) {
    return {
      ok: false,
      fileName,
      fileSize: bytes.length,
      error: `WebAssembly module failed to load: ${(e as Error).message}`,
    };
  }

  const t0 = performance.now();
  const ptr = mod._malloc(bytes.length);
  if (!ptr) {
    return {
      ok: false,
      fileName,
      fileSize: bytes.length,
      error: 'Out of memory allocating the wasm buffer',
    };
  }
  const namePtr = writeCString(mod, fileName);
  try {
    mod.HEAPU8.set(bytes, ptr);
    const rc = mod._wasm_analyze(ptr, bytes.length, namePtr);
    if (rc !== 0) {
      const error = mod.UTF8ToString(mod._wasm_get_error());
      return { ok: false, fileName, fileSize: bytes.length, error };
    }
    const json = mod.UTF8ToString(mod._wasm_get_json());
    const dump = mod.UTF8ToString(mod._wasm_get_dump());
    const analysis = JSON.parse(json) as ElfAnalysis;
    const durationMs = Math.round(performance.now() - t0);
    return { ok: true, fileName, fileSize: bytes.length, analysis, dump, durationMs, engine: 'main' };
  } finally {
    mod._free(namePtr);
    mod._free(ptr);
  }
}

/**
 * Run the ELF analysis on raw bytes, fully client-side.
 * Prefers the Web Worker engine; falls back to the main thread only when the
 * worker could not be started (bytes are still intact in that case — they are
 * only transferred after the worker is ready).
 */
export async function analyzeElfBytes(
  fileName: string,
  bytes: Uint8Array
): Promise<AnalyzeResult> {
  // Capture before any transfer detaches the buffer
  const byteLength = bytes.length;
  try {
    const w = await getWorker();
    const id = ++seq;
    const msg = await new Promise<WorkerResultMsg>((resolve, reject) => {
      pending.set(id, resolve);
      // Zero-copy transfer: the worker owns the buffer from here on.
      // This is safe because the worker is already 'ready' — if it dies
      // mid-analysis we surface its error instead of falling back.
      w.postMessage({ type: 'analyze', id, fileName, buffer: bytes.buffer }, [
        bytes.buffer,
      ]);
      // Generous timeout: the worker processes analyses serially, so a queued
      // file may wait for predecessors before its parse even starts.
      setTimeout(() => {
        if (pending.has(id)) {
          pending.delete(id);
          reject(new Error('Worker analysis timed out'));
        }
      }, 600000);
    });
    const size = msg.fileSize || byteLength;
    if (msg.rc !== 0) {
      return { ok: false, fileName, fileSize: size, error: msg.error || 'Analysis failed in worker' };
    }
    const analysis = JSON.parse(msg.json) as ElfAnalysis;
    return {
      ok: true,
      fileName,
      fileSize: size,
      analysis,
      dump: msg.dump,
      durationMs: msg.durationMs,
      engine: 'worker',
    };
  } catch (e) {
    // If the buffer was already transferred to a dead worker we cannot
    // retry on the main thread — surface the error instead.
    if (bytes.length === 0) {
      return {
        ok: false,
        fileName,
        fileSize: byteLength,
        error: `Worker failed during analysis: ${(e as Error).message}`,
      };
    }
    // worker unavailable before consuming the buffer — main-thread fallback
    return analyzeOnMainThread(fileName, bytes);
  }
}

/** Convenience wrapper for File objects (drag & drop / file picker). */
export async function analyzeFile(file: File): Promise<AnalyzeResult> {
  const buf = await file.arrayBuffer();
  return analyzeElfBytes(file.name, new Uint8Array(buf));
}

// ============================================================================
// Exports (downloads)
// ============================================================================

function saveTextFile(name: string, text: string, mime: string): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Download a generated dump.cpp text (replaces the CLI's ofstream). */
export function downloadDump(fileName: string, dump: string): void {
  const base = fileName.replace(/\.[^.]+$/, '') || 'dump';
  saveTextFile(`${base}_dump.cpp`, dump, 'text/x-c++src;charset=utf-8');
}

/** Download the full structured analysis as pretty-printed JSON. */
export function downloadJson(fileName: string, result: AnalyzeSuccess): void {
  const base = fileName.replace(/\.[^.]+$/, '') || 'dump';
  const payload = {
    generator: 'Dumping LIB R3 — WebAssembly Edition',
    file: result.fileName,
    fileSize: result.fileSize,
    parsedInMs: result.durationMs,
    engine: result.engine,
    stats: {
      symbols: result.analysis.symbolCount,
      functions: result.analysis.funcCount,
      classes: result.analysis.classCount,
      freeFunctions: result.analysis.freeFuncCount,
      globals: result.analysis.objectCount,
      vtables: result.analysis.vtableCount,
    },
    header: {
      class: result.analysis.elfClass === 2 ? 'ELF64' : 'ELF32',
      endian: result.analysis.elfEndian === 2 ? 'big' : 'little',
      type: result.analysis.elfType,
      machine: result.analysis.machine,
      flags: result.analysis.elfFlags,
    },
    classes: result.analysis.classes,
    freeFunctions: result.analysis.freeFuncs,
    globals: result.analysis.objects,
    vtables: result.analysis.vtables,
  };
  saveTextFile(
    `${base}_analysis.json`,
    JSON.stringify(payload, null, 2),
    'application/json;charset=utf-8'
  );
}

// ============================================================================
// IDA script generation
// ============================================================================

/**
 * Generate an IDAPython script that renames functions, globals and vtables
 * at their file addresses using mangled names (IDA demangles them
 * automatically) with the demangled form kept as a repeatable comment.
 */
export function downloadIdaScript(fileName: string, result: AnalyzeSuccess): void {
  const base = fileName.replace(/\.[^.]+$/, '') || 'dump';
  const lines: string[] = [];

  const entries: Array<{ addr: string; mangled: string; demangled: string }> = [];

  for (const cls of result.analysis.classes) {
    for (const m of cls.methods) {
      entries.push({ addr: m.o, mangled: m.mn || m.m, demangled: `${cls.name}::${m.m}` });
    }
  }
  for (const f of result.analysis.freeFuncs) {
    entries.push({ addr: f.o, mangled: f.mn || f.m, demangled: f.m });
  }
  for (const o of result.analysis.objects) {
    entries.push({ addr: o.o, mangled: o.mn || o.m, demangled: o.m });
  }
  for (const vt of result.analysis.vtables) {
    entries.push({ addr: vt.o, mangled: vt.mn, demangled: `vtable for ${vt.cls}` });
    for (const e of vt.e) {
      if (e.t !== '0x0') {
        entries.push({ addr: e.t, mangled: '', demangled: `${vt.cls}::vtbl_slot_${e.i}` });
      }
    }
  }

  lines.push('#!/usr/bin/env python3');
  lines.push('# =============================================================');
  lines.push('# IDA Pro rename script');
  lines.push('# Generated by Dumping LIB R3 - WebAssembly Edition');
  lines.push(`# Source file : ${result.fileName}`);
  lines.push(`# Symbols     : ${entries.length}`);
  lines.push('# =============================================================');
  lines.push('# Usage: IDA Pro -> File -> Script file... -> select this .py');
  lines.push('# Addresses are file virtual addresses; IDA rebasing is handled');
  lines.push('# automatically when the same ELF image is loaded.');
  lines.push('');
  lines.push('import ida_name');
  lines.push('import ida_bytes');
  lines.push('import idc');
  lines.push('import re');
  lines.push('');
  lines.push('ENTRIES = [');
  for (const e of entries) {
    const dem = e.demangled.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const man = e.mangled.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const addr = parseInt(e.addr, 16).toString(16);
    lines.push(`    (0x${addr}, '${man}', '${dem}'),`);
  }
  lines.push(']');
  lines.push('');
  lines.push('');
  lines.push('def ida_safe(name):');
  lines.push("    return re.sub(r'[^A-Za-z0-9_$?<>:()[\\]{}#,.~* &+\\-]', '_', name)[:200]");
  lines.push('');
  lines.push('');
  lines.push('def set_safe_name(ea, name):');
  lines.push('    try:');
  lines.push('        return bool(ida_name.set_name(ea, name, ida_name.SN_NOWARN | ida_name.SN_NOCHECK))');
  lines.push('    except Exception:');
  lines.push('        return False');
  lines.push('');
  lines.push('');
  lines.push('def main():');
  lines.push('    applied = 0');
  lines.push('    comments = 0');
  lines.push('    for ea, mangled, demangled in ENTRIES:');
  lines.push("        if mangled and mangled.startswith('_Z'):");
  lines.push('            # mangled C++ name - IDA demangles it automatically');
  lines.push('            if set_safe_name(ea, mangled):');
  lines.push('                applied += 1');
  lines.push('        else:');
  lines.push('            # plain C symbol: sanitize the name');
  lines.push('            if set_safe_name(ea, ida_safe(mangled or demangled)):');
  lines.push('                applied += 1');
  lines.push('        try:');
  lines.push('            ida_bytes.set_cmt(ea, demangled, 1)  # repeatable comment');
  lines.push('            comments += 1');
  lines.push('        except Exception:');
  lines.push('            pass');
  lines.push("    print('Dumping LIB R3: %d names applied, %d comments set' % (applied, comments))");
  lines.push('');
  lines.push('');
  lines.push('main()');

  saveTextFile(`${base}_ida_rename.py`, lines.join('\n'), 'text/x-python;charset=utf-8');
}

// ============================================================================
// Formatting helpers
// ============================================================================

/** Human-readable ELF type names. */
export function elfTypeName(t: number): string {
  switch (t) {
    case 1: return 'REL (relocatable)';
    case 2: return 'EXEC (executable)';
    case 3: return 'DYN (shared object / PIE)';
    case 4: return 'CORE (core dump)';
    default: return `type ${t}`;
  }
}

/** Format bytes for display. */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}
