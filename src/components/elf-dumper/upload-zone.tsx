'use client';

import { useCallback, useRef, useState } from 'react';
import { FileUp } from 'lucide-react';
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
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="w-full max-w-sm">
        <div
          role="button"
          tabIndex={0}
          aria-label="Upload ELF binaries for analysis"
          className={`rounded-lg border p-10 text-center transition-colors cursor-pointer focus:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 ${
            dragging
              ? 'border-primary/50 bg-primary/5'
              : 'border-input bg-accent/20 hover:border-muted-foreground/40 hover:bg-accent/40'
          } ${busy ? 'pointer-events-none opacity-60' : ''}`}
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
          <FileUp className="mx-auto h-6 w-6 text-muted-foreground" aria-hidden="true" />
          <p className="mt-3 text-sm font-medium">
            {busy ? 'Loading sample…' : 'Drop ELF binaries here'}
          </p>
          <p className="mt-1.5 text-xs text-muted-foreground">
            or click to browse <span className="font-mono">(.so, .o, .a)</span>
          </p>
        </div>

        <div className="mt-4 text-center">
          <button
            type="button"
            className="rounded-sm text-xs text-foreground/75 underline-offset-4 transition-colors hover:text-foreground hover:underline disabled:pointer-events-none disabled:opacity-50"
            onClick={onSample}
            disabled={busy}
          >
            Try sample — <span className="font-mono">game-sdk.so</span> ({formatBytes(sampleSize)})
          </button>
        </div>

        <p className="mt-6 text-center text-[11px] text-muted-foreground">
          100% local — files never leave your browser
        </p>
      </div>
    </div>
  );
}
