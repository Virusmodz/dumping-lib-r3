'use client';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatBytes } from '@/lib/elf-dumper';
import { Boxes, FileCode2, Loader2, Plus, Trash2, TriangleAlert } from 'lucide-react';

export type BatchStatus = 'queued' | 'analyzing' | 'done' | 'error';

export interface BatchItem {
  id: string;
  fileName: string;
  fileSize: number;
  status: BatchStatus;
  classCount?: number;
  error?: string;
}

interface FileSidebarProps {
  items: BatchItem[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
  onAdd: () => void;
}

function StatusIcon({ status }: { status: BatchStatus }) {
  switch (status) {
    case 'analyzing':
      return <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-500" aria-hidden="true" />;
    case 'queued':
      return <Loader2 className="h-3.5 w-3.5 text-zinc-600" aria-hidden="true" />;
    case 'error':
      return <TriangleAlert className="h-3.5 w-3.5 text-red-500" aria-hidden="true" />;
    default:
      return <FileCode2 className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />;
  }
}

export function FileSidebar({
  items,
  activeId,
  onSelect,
  onRemove,
  onClear,
  onAdd,
}: FileSidebarProps) {
  const done = items.filter((i) => i.status === 'done').length;

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-mono text-xs uppercase tracking-wider text-zinc-500">
          analyzed files <span className="text-emerald-500">{done}</span>/{items.length}
        </h2>
        <div className="flex gap-1">
          <Button
            size="sm"
            variant="outline"
            className="h-7 border-zinc-700 bg-zinc-900 px-2 font-mono text-[11px] text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
            onClick={onAdd}
            aria-label="Add more libraries"
          >
            <Plus className="h-3 w-3" aria-hidden="true" />
            <span className="ml-1 hidden sm:inline">add</span>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 font-mono text-[11px] text-zinc-500 hover:text-red-400"
            onClick={onClear}
            aria-label="Clear all files"
          >
            <Trash2 className="h-3 w-3" aria-hidden="true" />
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1 rounded-lg border border-zinc-800/60 bg-zinc-950/40">
        <ul className="divide-y divide-zinc-800/40">
          {items.map((item) => {
            const isActive = item.id === activeId;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onSelect(item.id)}
                  aria-current={isActive ? 'true' : undefined}
                  className={`group flex w-full items-center gap-2 px-3 py-2 text-left transition-colors ${
                    isActive ? 'bg-emerald-950/30' : 'hover:bg-zinc-900/60'
                  }`}
                >
                  <StatusIcon status={item.status} />
                  <span className="min-w-0 flex-1">
                    <span
                      className={`block truncate font-mono text-xs ${
                        isActive ? 'text-emerald-300' : 'text-zinc-300'
                      }`}
                      title={item.fileName}
                    >
                      {item.fileName}
                    </span>
                    <span className="block font-mono text-[10px] text-zinc-600">
                      {formatBytes(item.fileSize)}
                      {item.status === 'done' && item.classCount !== undefined && (
                        <> · <Boxes className="inline h-2.5 w-2.5" aria-hidden="true" /> {item.classCount} classes</>
                      )}
                      {item.status === 'error' && <span className="text-red-500"> · failed</span>}
                      {item.status === 'analyzing' && <span className="text-emerald-600"> · parsing…</span>}
                      {item.status === 'queued' && ' · queued'}
                    </span>
                  </span>
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label={`Remove ${item.fileName}`}
                    className="opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemove(item.id);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        e.stopPropagation();
                        onRemove(item.id);
                      }
                    }}
                  >
                    <Trash2 className="h-3 w-3 text-zinc-600 hover:text-red-400" aria-hidden="true" />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </ScrollArea>

      {items.length > 1 && (
        <Badge
          variant="outline"
          className="self-start border-zinc-800 bg-zinc-900/60 font-mono text-[10px] text-zinc-500"
        >
          batch mode · {items.length} files
        </Badge>
      )}
    </div>
  );
}
