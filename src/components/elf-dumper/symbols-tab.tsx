'use client';

import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Hash, Search } from 'lucide-react';
import type { ElfMethod } from '@/lib/elf-dumper';

interface SymbolsTabProps {
  freeFuncs: ElfMethod[];
  objects: ElfMethod[];
}

export function SymbolsTab({ freeFuncs, objects }: SymbolsTabProps) {
  const [query, setQuery] = useState('');

  const rows = useMemo(() => {
    const all: Array<{ kind: 'FUNC' | 'OBJ'; sym: ElfMethod }> = [
      ...freeFuncs.map((sym) => ({ kind: 'FUNC' as const, sym })),
      ...objects.map((sym) => ({ kind: 'OBJ' as const, sym })),
    ];
    const q = query.trim().toLowerCase();
    const filtered = q
      ? all.filter((r) => r.sym.m.toLowerCase().includes(q) || r.sym.o.toLowerCase().includes(q))
      : all;
    // globals first (fewer), then functions alphabetically
    filtered.sort((a, b) =>
      a.kind === b.kind ? a.sym.m.localeCompare(b.sym.m) : a.kind === 'OBJ' ? -1 : 1
    );
    return filtered;
  }, [freeFuncs, objects, query]);

  const funcTotal = freeFuncs.length;
  const objTotal = objects.length;

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
          placeholder="Filter functions & globals..."
          className="border-zinc-700 bg-zinc-900 pl-9 font-mono text-sm text-zinc-200 placeholder:text-zinc-600 focus-visible:ring-emerald-500"
          aria-label="Filter symbols"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[11px] text-zinc-500">
          {rows.length}/{funcTotal + objTotal}
        </span>
      </div>

      <ScrollArea className="h-[420px] flex-1 rounded-lg border border-zinc-800/60 bg-zinc-950/40">
        {rows.length === 0 ? (
          <p className="py-10 text-center font-mono text-sm text-zinc-500">
            {query
              ? <>no symbols match <span className="text-emerald-500">&quot;{query}&quot;</span></>
              : 'no free symbols in this image'}
          </p>
        ) : (
          <table className="w-full">
            <thead className="sticky top-0 bg-zinc-950/95 backdrop-blur">
              <tr className="border-b border-zinc-800">
                <th className="w-16 px-4 py-2 text-left font-mono text-[10px] font-normal uppercase tracking-wider text-zinc-500">
                  kind
                </th>
                <th className="px-4 py-2 text-left font-mono text-[10px] font-normal uppercase tracking-wider text-zinc-500">
                  symbol
                </th>
                <th className="hidden px-4 py-2 text-right font-mono text-[10px] font-normal uppercase tracking-wider text-zinc-500 sm:table-cell">
                  size
                </th>
                <th className="px-4 py-2 text-right font-mono text-[10px] font-normal uppercase tracking-wider text-zinc-500">
                  address
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ kind, sym }) => (
                <tr
                  key={`${kind}-${sym.mn || sym.m}-${sym.o}`}
                  className="border-b border-zinc-800/40 transition-colors hover:bg-zinc-900/60"
                >
                  <td className="px-4 py-1.5">
                    <Badge
                      variant="outline"
                      className={`font-mono text-[10px] ${
                        kind === 'FUNC'
                          ? 'border-emerald-900/60 bg-emerald-950/40 text-emerald-400'
                          : 'border-sky-900/60 bg-sky-950/40 text-sky-400'
                      }`}
                    >
                      {kind === 'FUNC' ? 'fn' : 'var'}
                    </Badge>
                  </td>
                  <td className="max-w-0 truncate px-4 py-1.5 font-mono text-xs text-zinc-300" title={sym.mn || sym.m}>
                    {sym.m}
                  </td>
                  <td className="hidden whitespace-nowrap px-4 py-1.5 text-right font-mono text-[11px] text-zinc-500 sm:table-cell">
                    {kind === 'OBJ' && sym.s ? `${sym.s} B` : '—'}
                  </td>
                  <td className="whitespace-nowrap px-4 py-1.5 text-right font-mono text-[11px] text-amber-500/80">
                    <Hash className="mr-0.5 inline h-3 w-3" aria-hidden="true" />
                    {sym.o}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </ScrollArea>

      <p className="font-mono text-[11px] text-zinc-600">
        {`// ${funcTotal} free functions (no class scope) + ${objTotal} global variables (vtable machinery excluded) — both skipped by the original CLI tool`}
      </p>
    </div>
  );
}
