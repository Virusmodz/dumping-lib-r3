'use client';

import { formatBytes, elfTypeName, type ElfAnalysis } from '@/lib/elf-dumper';

interface StatsBarProps {
  fileName: string;
  fileSize: number;
  analysis: ElfAnalysis;
  durationMs: number;
  engine: 'worker' | 'main';
}

function StatChip({ label, value, accent }: { label: string; value: string; accent?: 'emerald' | 'amber' }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-lg border border-zinc-800 bg-zinc-900/70 px-3 py-2">
      <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">{label}</span>
      <span
        className={`truncate font-mono text-sm ${
          accent === 'emerald'
            ? 'text-emerald-400'
            : accent === 'amber'
              ? 'text-amber-500'
              : 'text-zinc-200'
        }`}
        title={value}
      >
        {value}
      </span>
    </div>
  );
}

export function StatsBar({ fileName, fileSize, analysis, durationMs, engine }: StatsBarProps) {
  const bits = analysis.elfClass === 2 ? 'ELF64' : 'ELF32';
  const endian = analysis.elfEndian === 2 ? 'big-endian' : 'little-endian';

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="truncate font-mono text-lg text-zinc-100" title={fileName}>
          <span className="text-emerald-500">$</span> {fileName}
        </h2>
        <p className="font-mono text-xs text-zinc-500">
          parsed in <span className="text-emerald-500">{durationMs} ms</span> · wasm{' '}
          {engine === 'worker' ? (
            <span className="text-emerald-600">· web worker</span>
          ) : (
            <span className="text-amber-600">· main thread</span>
          )}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <StatChip label="File size" value={formatBytes(fileSize)} />
        <StatChip label="Format" value={`${bits} · ${endian}`} />
        <StatChip label="Arch" value={analysis.machine.replace(/ \(.*\)/, '')} />
        <StatChip label="Type" value={elfTypeName(analysis.elfType)} />
        <StatChip label="Symbols scanned" value={analysis.symbolCount.toLocaleString()} />
        <StatChip label="Functions found" value={analysis.funcCount.toLocaleString()} accent="emerald" />
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatChip label="Classes dumped" value={analysis.classCount.toLocaleString()} accent="emerald" />
        <StatChip label="Global vars" value={analysis.objectCount.toLocaleString()} />
        <StatChip label="Vtables rebuilt" value={analysis.vtableCount.toLocaleString()} accent="amber" />
        <StatChip
          label="Methods total"
          value={analysis.classes.reduce((n, c) => n + c.methods.length, 0).toLocaleString()}
        />
      </div>
    </div>
  );
}
