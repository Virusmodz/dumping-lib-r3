'use client';

import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search } from 'lucide-react';
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
    filtered.sort((a, b) =>
      a.kind === b.kind ? a.sym.m.localeCompare(b.sym.m) : a.kind === 'OBJ' ? -1 : 1
    );
    return filtered;
  }, [freeFuncs, objects, query]);

  const total = freeFuncs.length + objects.length;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="relative shrink-0 border-b">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/70"
          aria-hidden="true"
        />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter symbols"
          className="h-10 rounded-none border-0 bg-transparent pl-9 text-xs shadow-none focus-visible:ring-0 focus-visible:border-transparent dark:bg-transparent"
          aria-label="Filter symbols"
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] tabular-nums text-muted-foreground/70">
          {rows.length}/{total}
        </span>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        {rows.length === 0 ? (
          <p className="py-12 text-center text-xs text-muted-foreground">
            {query ? 'No matches' : 'No free symbols in this image'}
          </p>
        ) : (
          <table className="w-full">
            <thead className="sticky top-0 z-10 bg-background/95 backdrop-blur">
              <tr className="border-b">
                <th className="w-14 px-4 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  kind
                </th>
                <th className="px-4 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  symbol
                </th>
                <th className="hidden w-20 px-4 py-2 text-right text-[10px] font-medium uppercase tracking-wider text-muted-foreground sm:table-cell">
                  size
                </th>
                <th className="w-24 px-4 py-2 text-right text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  offset
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ kind, sym }) => (
                <tr
                  key={`${kind}-${sym.mn || sym.m}-${sym.o}`}
                  className="border-b border-border/50 transition-colors hover:bg-accent/40"
                >
                  <td className="px-4 py-1.5">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground/80">
                      {kind === 'FUNC' ? 'fn' : 'var'}
                    </span>
                  </td>
                  <td className="max-w-0 truncate px-4 py-1.5 font-mono text-xs text-foreground/90" title={sym.mn || sym.m}>
                    {sym.m}
                  </td>
                  <td className="hidden whitespace-nowrap px-4 py-1.5 text-right font-mono text-[11px] tabular-nums text-muted-foreground sm:table-cell">
                    {kind === 'OBJ' && sym.s ? `${sym.s} B` : '—'}
                  </td>
                  <td className="whitespace-nowrap px-4 py-1.5 text-right font-mono text-[11px] tabular-nums text-muted-foreground/70">
                    {sym.o}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </ScrollArea>
    </div>
  );
}
