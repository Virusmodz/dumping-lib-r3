'use client';

import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ChevronRight, Search, Table2, Info } from 'lucide-react';
import type { ElfVtable } from '@/lib/elf-dumper';

interface VtablesProps {
  vtables: ElfVtable[];
}

function VtableCard({ vt, query }: { vt: ElfVtable; query: string }) {
  const [open, setOpen] = useState(false);
  const active = query !== '';

  return (
    <div className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/50 transition-colors hover:border-zinc-700">
      <button
        type="button"
        aria-expanded={open || active}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-zinc-800/60"
      >
        <ChevronRight
          className={`h-4 w-4 shrink-0 text-zinc-500 transition-transform duration-200 ${
            open || active ? 'rotate-90 text-emerald-500' : ''
          }`}
          aria-hidden="true"
        />
        <Table2 className="h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate font-mono text-sm text-zinc-200">
          {vt.cls}
        </span>
        <span className="hidden shrink-0 font-mono text-[11px] text-amber-500/80 sm:inline">
          {vt.o}
        </span>
        <Badge
          variant="outline"
          className="ml-2 shrink-0 border-amber-900/60 bg-amber-950/40 font-mono text-[10px] text-amber-400"
        >
          {vt.e.length} vfns
        </Badge>
      </button>

      {(open || active) && (
        <div className="border-t border-zinc-800/80 bg-zinc-950/60">
          <div className="flex flex-wrap gap-x-4 gap-y-1 px-3 py-2 font-mono text-[11px] text-zinc-500">
            <span>
              typeinfo: <span className="text-zinc-300">{vt.rtti}</span>
            </span>
            <span>
              size: <span className="text-zinc-300">{vt.s} B</span>
            </span>
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-t border-zinc-800/60">
                <th className="w-14 px-3 py-1.5 text-left font-mono text-[10px] font-normal uppercase tracking-wider text-zinc-600">
                  slot
                </th>
                <th className="px-3 py-1.5 text-left font-mono text-[10px] font-normal uppercase tracking-wider text-zinc-600">
                  virtual function
                </th>
                <th className="hidden px-3 py-1.5 text-right font-mono text-[10px] font-normal uppercase tracking-wider text-zinc-600 sm:table-cell">
                  target
                </th>
              </tr>
            </thead>
            <tbody>
              {vt.e.map((e) => (
                <tr
                  key={e.i}
                  className="border-t border-zinc-800/40 transition-colors hover:bg-zinc-900/60"
                >
                  <td className="px-3 py-1.5 font-mono text-[11px] text-emerald-600">
                    [{e.i}]
                  </td>
                  <td className="max-w-0 truncate px-3 py-1.5 font-mono text-xs text-zinc-300">
                    {e.m}
                  </td>
                  <td className="hidden whitespace-nowrap px-3 py-1.5 text-right font-mono text-[11px] text-amber-500/80 sm:table-cell">
                    {e.t}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function Vtables({ vtables }: VtablesProps) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return vtables;
    return vtables
      .map((vt) => {
        const clsMatch = vt.cls.toLowerCase().includes(q);
        if (clsMatch) return vt;
        const e = vt.e.filter(
          (s) => s.m.toLowerCase().includes(q) || s.t.toLowerCase().includes(q)
        );
        if (e.length === 0) return null;
        return { ...vt, e };
      })
      .filter((v): v is ElfVtable => v !== null);
  }, [vtables, query]);

  const totalSlots = useMemo(
    () => filtered.reduce((n, v) => n + v.e.length, 0),
    [filtered]
  );

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500"
          aria-hidden="true"
        />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter vtables & virtual functions..."
          className="border-zinc-700 bg-zinc-900 pl-9 font-mono text-sm text-zinc-200 placeholder:text-zinc-600 focus-visible:ring-emerald-500"
          aria-label="Filter vtables"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[11px] text-zinc-500">
          {filtered.length}/{vtables.length}
        </span>
      </div>

      <ScrollArea className="h-[420px] flex-1 rounded-lg border border-zinc-800/60 bg-zinc-950/40 p-2">
        {vtables.length === 0 ? (
          <div className="space-y-2 py-10 text-center">
            <Info className="mx-auto h-5 w-5 text-zinc-600" aria-hidden="true" />
            <p className="font-mono text-sm text-zinc-500">
              no vtables in this image (no polymorphic C++ classes)
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <p className="py-10 text-center font-mono text-sm text-zinc-500">
            no vtables match <span className="text-emerald-500">&quot;{query}&quot;</span>
          </p>
        ) : (
          <div className="space-y-2">
            {filtered.map((vt) => (
              <VtableCard key={`${vt.mn}-${vt.o}`} vt={vt} query={query.trim()} />
            ))}
          </div>
        )}
      </ScrollArea>

      <p className="font-mono text-[11px] text-zinc-600">
        {`// vtables rebuilt from _ZTV symbols + relocations (Itanium ABI) · ${totalSlots} virtual slots resolved`}
      </p>
    </div>
  );
}
