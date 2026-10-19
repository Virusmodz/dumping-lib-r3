'use client';

import { formatBytes, elfTypeName, type ElfAnalysis } from '@/lib/elf-dumper';

interface StatsBarProps {
  fileName: string;
  fileSize: number;
  analysis: ElfAnalysis;
  durationMs: number;
  engine: 'worker' | 'main';
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="whitespace-nowrap text-xs text-muted-foreground">
      {label}
      <span className="ml-1.5 font-medium tabular-nums text-foreground">{value}</span>
    </span>
  );
}

export function StatsBar({ fileName, fileSize, analysis, durationMs, engine }: StatsBarProps) {
  const bits = analysis.elfClass === 2 ? 'ELF64' : 'ELF32';
  const endian = analysis.elfEndian === 2 ? 'BE' : 'LE';

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 border-b px-4 py-2.5">
      <span className="min-w-0 truncate font-mono text-[13px] font-medium" title={fileName}>
        {fileName}
      </span>
      <span className="whitespace-nowrap font-mono text-[11px] text-muted-foreground">
        {bits} · {endian} · {analysis.machine.replace(/ \(.*\)/, '')} ·{' '}
        {elfTypeName(analysis.elfType)} · {formatBytes(fileSize)} · {durationMs} ms
        {engine === 'main' ? ' · fallback' : ''}
      </span>
      <span className="ml-auto flex flex-wrap items-center gap-x-5 gap-y-1.5">
        <Stat label="Classes" value={analysis.classCount.toLocaleString()} />
        <Stat label="Methods" value={analysis.classes.reduce((n, c) => n + c.methods.length, 0).toLocaleString()} />
        <Stat label="Vtables" value={analysis.vtableCount.toLocaleString()} />
        <Stat label="Globals" value={analysis.objectCount.toLocaleString()} />
        <Stat label="Symbols" value={analysis.symbolCount.toLocaleString()} />
      </span>
    </div>
  );
}
