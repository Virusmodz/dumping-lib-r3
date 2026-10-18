'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Check, Copy, FileCode2 } from 'lucide-react';

interface DumpViewProps {
  dump: string;
  classCount: number;
}

/**
 * Hard cap on rendered lines — real-world dumps (e.g. libcocos2dcpp.so)
 * exceed 100k lines; rendering them all would freeze the tab. The copy /
 * download buttons always operate on the FULL text, only the preview is
 * capped.
 */
const MAX_RENDERED_LINES = 5000;

function lineClass(line: string): string {
  if (/^\/\/ =+$/.test(line)) return 'text-emerald-900'; // section separator
  if (/^class\s/.test(line)) return 'text-emerald-400 font-semibold';
  if (/^public:/.test(line)) return 'text-sky-400';
  if (/^\};/.test(line)) return 'text-zinc-500';
  if (/^    static void\*/.test(line)) return 'text-amber-300';
  if (/^\s*\/\//.test(line)) return 'text-zinc-600'; // Offset | Size | Type | Mangled
  return 'text-zinc-300';
}

function CodeBlock({ dump }: { dump: string }) {
  const lines = useMemo(() => dump.split('\n'), [dump]);
  const truncated = lines.length > MAX_RENDERED_LINES;
  const shown = truncated ? lines.slice(0, MAX_RENDERED_LINES) : lines;
  return (
    <pre className="p-0">
      <code className="block font-mono text-xs leading-relaxed">
        {shown.map((line, i) => (
          <span key={i} className="flex">
            <span
              className="w-10 shrink-0 select-none pr-3 text-right text-zinc-700"
              aria-hidden="true"
            >
              {i + 1}
            </span>
            <span className={`${lineClass(line)} whitespace-pre-wrap break-all pl-1`}>
              {line === '' ? ' ' : line}
            </span>
          </span>
        ))}
        {truncated && (
          <span className="flex">
            <span
              className="w-10 shrink-0 select-none pr-3 text-right text-zinc-700"
              aria-hidden="true"
            >
              …
            </span>
            <span className="pl-1 text-zinc-500 italic">
              preview truncated at {MAX_RENDERED_LINES.toLocaleString()} of{' '}
              {lines.length.toLocaleString()} lines — use copy / download to get
              the complete dump
            </span>
          </span>
        )}
      </code>
    </pre>
  );
}

export function DumpView({ dump, classCount }: DumpViewProps) {
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
    <div className="flex h-full flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-mono text-xs text-zinc-500">
          <FileCode2 className="h-4 w-4 text-emerald-600" aria-hidden="true" />
          {classCount.toLocaleString()} class blocks · {(byteLen / 1024).toFixed(1)} KB generated
        </p>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            className="border-zinc-700 bg-zinc-900 font-mono text-xs text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
            onClick={onCopy}
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" /> copied
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" aria-hidden="true" /> copy
              </>
            )}
          </Button>
        </div>
      </div>

      <ScrollArea className="h-[460px] flex-1 rounded-lg border border-zinc-800/60 bg-zinc-950/70">
        <div className="p-4">
          <CodeBlock dump={dump} />
        </div>
      </ScrollArea>
    </div>
  );
}
