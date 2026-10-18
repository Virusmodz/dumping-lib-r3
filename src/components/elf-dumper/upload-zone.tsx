'use client';

import { useCallback, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { formatBytes } from '@/lib/elf-dumper';

interface UploadZoneProps {
  onFiles: (files: File[]) => void;
  onSample: () => void;
  busy: boolean;
  sampleSize: number;
}

export function UploadZone({ onFiles, onSample, busy, sampleSize }: UploadZoneProps) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0) return;
      onFiles(Array.from(files));
    },
    [onFiles]
  );

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Upload an ELF shared library for analysis"
      className={`
        relative mx-auto w-full max-w-3xl rounded-xl border-2 border-dashed
        p-8 sm:p-12 text-center cursor-pointer transition-all duration-200
        focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500
        ${
          dragging
            ? 'border-emerald-400 bg-emerald-500/10 scale-[1.01]'
            : 'border-zinc-700 bg-zinc-900/50 hover:border-emerald-600/60 hover:bg-zinc-900'
        }
        ${busy ? 'pointer-events-none opacity-60' : ''}
      `}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        handleFiles(e.dataTransfer.files);
      }}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        className="sr-only"
        accept=".so,.bin,.elf,.o,.a,application/octet-stream"
        onChange={(e) => handleFiles(e.target.files)}
      />

      <div className="flex flex-col items-center gap-4">
        <div
          className={`flex h-16 w-16 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10 font-mono text-2xl text-emerald-400 transition-transform duration-200 ${
            dragging ? 'scale-110' : ''
          }`}
          aria-hidden="true"
        >
          {'{ }'}
        </div>

        <div className="space-y-1">
          <p className="font-mono text-base sm:text-lg text-zinc-100">
            {busy ? 'Parsing ELF image...' : 'Drop shared libraries here'}
          </p>
          <p className="font-mono text-xs sm:text-sm text-zinc-500">
            .so · .o · .a · .bin — any ELF image · <span className="text-emerald-600">batch supported</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <Button
            variant="outline"
            className="border-emerald-600/50 bg-emerald-950/40 font-mono text-emerald-300 hover:bg-emerald-900/40 hover:text-emerald-200"
            onClick={(e) => {
              e.stopPropagation();
              inputRef.current?.click();
            }}
          >
            Browse files
          </Button>
          <Button
            variant="ghost"
            className="font-mono text-zinc-400 hover:text-zinc-200"
            onClick={(e) => {
              e.stopPropagation();
              onSample();
            }}
          >
            Try sample lib ({formatBytes(sampleSize)})
          </Button>
        </div>
      </div>

      <p className="mt-6 font-mono text-[11px] leading-relaxed text-zinc-600">
        {'// files are parsed locally in your browser via WebAssembly — '}
        <span className="text-emerald-700">nothing is uploaded to any server</span>
      </p>
    </div>
  );
}
