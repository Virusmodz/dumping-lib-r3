'use client';

import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ChevronRight, Search } from 'lucide-react';
import type { ElfVtable } from '@/lib/elf-dumper';

interface VtablesProps {
  vtables: ElfVtable[];
}

function VtableRow({ vt, query }: { vt: ElfVtable; query: string }) {
  const [open, setOpen] = useState(false);
  const active = query !== '';

  return (
    <div>
      <button
        type="button"
        aria-expanded={open || active}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-1.5 px-4 py-[7px] text-left transition-colors hover:bg-accent/60"
      >
        <ChevronRight
          className={`h-3.5 w-3.5 shrink-0 text-muted-foreground/60 transition-transform ${
            open || active ? 'rotate-90' : ''
          }`}
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground/90">
          {vt.cls}
        </span>
        <span className="hidden shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground/70 sm:inline">
          {vt.o}
        </span>
        <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
          {vt.e.length}
        </span>
      </button>

      {(open || active) && (
        <div className="pb-2">
          <div className="flex gap-4 px-4 pb-1 pl-10 font-mono text-[11px] text-muted-foreground/70">
            <span>typeinfo: {vt.rtti}</span>
            <span>size: {vt.s} B</span>
          </div>
          {vt.e.map((e) => (
            <div
              key={e.i}
              className="flex items-center justify-between gap-4 py-1 pl-10 pr-4 transition-colors hover:bg-accent/40"
            >
              <span className="flex min-w-0 items-center gap-3">
                <span className="w-6 shrink-0 text-right font-mono text-[11px] tabular-nums text-muted-foreground/50">
                  {e.i}
                </span>
                <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">
                  {e.m}
                </span>
              </span>
              <span className="hidden shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground/70 sm:inline">
                {e.t}
              </span>
            </div>
          ))}
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
          placeholder="Filter vtables and virtual functions"
          className="h-10 rounded-none border-0 bg-transparent pl-9 text-xs shadow-none focus-visible:ring-0 focus-visible:border-transparent dark:bg-transparent"
          aria-label="Filter vtables"
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] tabular-nums text-muted-foreground/70">
          {filtered.length}/{vtables.length}
        </span>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        {vtables.length === 0 ? (
          <p className="py-12 text-center text-xs text-muted-foreground">
            No vtables in this image
          </p>
        ) : filtered.length === 0 ? (
          <p className="py-12 text-center text-xs text-muted-foreground">No matches</p>
        ) : (
          <div>
            {filtered.map((vt) => (
              <VtableRow key={`${vt.mn}-${vt.o}`} vt={vt} query={query.trim()} />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
