'use client';

import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ChevronRight, Search } from 'lucide-react';
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
      <mark className="rounded-[2px] bg-primary/25 text-foreground">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}

function ClassRow({ cls, query }: { cls: ElfClass; query: string }) {
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
          {highlight(cls.name, query)}
        </span>
        <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
          {cls.methods.length}
        </span>
      </button>

      {(open || active) && (
        <div>
          {cls.methods.map((m, i) => (
            <div
              key={`${cls.name}-${i}`}
              className="flex items-center justify-between gap-4 py-1 pl-10 pr-4 transition-colors hover:bg-accent/40"
            >
              <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">
                {highlight(m.m, query)}
              </span>
              <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground/70">
                {m.o}
              </span>
            </div>
          ))}
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
          placeholder="Filter classes and methods"
          className="h-10 rounded-none border-0 bg-transparent pl-9 text-xs shadow-none focus-visible:ring-0 focus-visible:border-transparent dark:bg-transparent"
          aria-label="Filter classes and methods"
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] tabular-nums text-muted-foreground/70">
          {filtered.length}/{classes.length}
        </span>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        {filtered.length === 0 ? (
          <p className="py-12 text-center text-xs text-muted-foreground">No matches</p>
        ) : (
          <div>
            {filtered.map((cls) => (
              <ClassRow key={cls.name} cls={cls} query={query.trim()} />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
