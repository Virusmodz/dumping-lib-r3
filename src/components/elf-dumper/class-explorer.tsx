'use client';

import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ChevronRight, Search, Hash } from 'lucide-react';
import type { ElfClass } from '@/lib/elf-dumper';

interface ClassExplorerProps {
  classes: ElfClass[];
}

function highlight(text: string, query: string) {
  if (!query) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded-sm bg-emerald-500/30 text-emerald-200">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}

function ClassCard({ cls, query }: { cls: ElfClass; query: string }) {
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
        <span className="min-w-0 flex-1 truncate font-mono text-sm text-zinc-200">
          {highlight(cls.name, query)}
        </span>
        <Badge
          variant="outline"
          className="ml-2 shrink-0 border-emerald-900/60 bg-emerald-950/40 font-mono text-[10px] text-emerald-400"
        >
          {cls.methods.length} fn
        </Badge>
      </button>

      {(open || active) && (
        <div className="border-t border-zinc-800/80 bg-zinc-950/60">
          <ul className="divide-y divide-zinc-800/50">
            {cls.methods.map((m, i) => (
              <li
                key={`${cls.name}-${i}`}
                className="flex items-center justify-between gap-3 px-3 py-1.5 pl-10"
              >
                <span className="min-w-0 truncate font-mono text-xs text-zinc-300">
                  {highlight(m.m, query)}
                </span>
                <span className="flex shrink-0 items-center gap-1 font-mono text-[11px] text-amber-500/80">
                  <Hash className="h-3 w-3" aria-hidden="true" />
                  {m.o}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function ClassExplorer({ classes }: ClassExplorerProps) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return classes;
    return classes
      .map((cls) => {
        const nameMatch = cls.name.toLowerCase().includes(q);
        if (nameMatch) return cls;
        const methods = cls.methods.filter((m) => m.m.toLowerCase().includes(q));
        if (methods.length === 0) return null;
        return { ...cls, methods };
      })
      .filter((c): c is ElfClass => c !== null);
  }, [classes, query]);

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
          placeholder="Filter classes & methods... (e.g. Renderer, drawFrame)"
          className="border-zinc-700 bg-zinc-900 pl-9 font-mono text-sm text-zinc-200 placeholder:text-zinc-600 focus-visible:ring-emerald-500"
          aria-label="Filter classes and methods"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[11px] text-zinc-500">
          {filtered.length}/{classes.length}
        </span>
      </div>

      <ScrollArea className="h-[420px] flex-1 rounded-lg border border-zinc-800/60 bg-zinc-950/40 p-2">
        {filtered.length === 0 ? (
          <p className="py-10 text-center font-mono text-sm text-zinc-500">
            no classes match <span className="text-emerald-500">&quot;{query}&quot;</span>
          </p>
        ) : (
          <div className="space-y-2">
            {filtered.map((cls) => (
              <ClassCard key={cls.name} cls={cls} query={query.trim()} />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
