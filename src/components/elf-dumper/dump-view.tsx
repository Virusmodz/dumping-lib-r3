'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { downloadDump } from '@/lib/elf-dumper';
import { Check, Copy, Download } from 'lucide-react';

interface DumpViewProps {
  dump: string;
  fileName: string;
  classCount: number;
}

/**
 * Hard cap on rendered lines — real-world dumps exceed 100k lines; rendering
 * them all would freeze the tab. Copy/download always use the FULL text.
 */
const MAX_RENDERED_LINES = 5000;

function lineClass(line: string): string {
  if (/^\/\/ =+$/.test(line)) return 'text-muted-foreground/30'; // section separator
  if (/^class\s/.test(line)) return 'text-blue-300';
  if (/^public:/.test(line)) return 'text-muted-foreground';
  if (/^\};/.test(line)) return 'text-muted-foreground/60';
  if (/^    static void\*/.test(line)) return 'text-amber-200/80';
  if (/^\s*\/\//.test(line)) return 'text-muted-foreground/60'; // Offset | Size | Type | Mangled
  return 'text-zinc-400';
}

function CodeBlock({ dump }: { dump: string }) {
  const lines = useMemo(() => dump.split('\n'), [dump]);
  const truncated = lines.length > MAX_RENDERED_LINES;
  const shown = truncated ? lines.slice(0, MAX_RENDERED_LINES) : lines;
  return (
    <div className="py-2 font-mono text-xs leading-[1.5]">
      {shown.map((line, i) => (
        <div key={i} className="flex">
          <span className="w-12 shrink-0 select-none pr-3 text-right text-muted-foreground/30" aria-hidden="true">
            {i + 1}
          </span>
          <span className={`${lineClass(line)} whitespace-pre-wrap break-all pl-1`}>
            {line === '' ? ' ' : line}
          </span>
        </div>
      ))}
      {truncated && (
        <div className="flex">
          <span className="w-12 shrink-0 select-none pr-3 text-right text-muted-foreground/30" aria-hidden="true">…</span>
          <span className="pl-1 text-muted-foreground/70">
            {lines.length.toLocaleString()} lines total — use copy or download for the full dump
          </span>
        </div>
      )}
    </div>
  );
}

export function DumpView({ dump, fileName, classCount }: DumpViewProps) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(dump);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable */
    }
  };

  const byteLen = useMemo(() => new TextEncoder().encode(dump).length, [dump]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-10 shrink-0 items-center justify-between gap-2 border-b px-4">
        <span className="truncate font-mono text-xs text-muted-foreground">
          dump.cpp
          <span className="ml-3 tabular-nums">
            {classCount.toLocaleString()} classes · {(byteLen / 1024).toFixed(1)} KB
          </span>
        </span>
        <div className="flex shrink-0 gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2.5 text-xs"
            onClick={onCopy}
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" />
            ) : (
              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {copied ? 'Copied' : 'Copy'}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2.5 text-xs"
            onClick={() => downloadDump(fileName, dump)}
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            Download
          </Button>
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1 bg-card/40">
        <CodeBlock dump={dump} />
      </ScrollArea>
    </div>
  );
}
