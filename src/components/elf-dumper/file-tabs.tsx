'use client';

import { Loader2, Plus, X } from 'lucide-react';

export type BatchStatus = 'queued' | 'analyzing' | 'done' | 'error';

export interface BatchItem {
  id: string;
  fileName: string;
  fileSize: number;
  status: BatchStatus;
  classCount?: number;
  error?: string;
}

interface FileTabsProps {
  items: BatchItem[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onAdd: () => void;
}

function StatusDot({ status }: { status: BatchStatus }) {
  switch (status) {
    case 'analyzing':
      return <Loader2 className="h-3 w-3 shrink-0 animate-spin text-primary" aria-hidden="true" />;
    case 'queued':
      return <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/50" aria-hidden="true" />;
    case 'error':
      return <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-destructive" aria-hidden="true" />;
    default:
      return <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden="true" />;
  }
}

export function FileTabs({ items, activeId, onSelect, onRemove, onAdd }: FileTabsProps) {
  return (
    <div className="flex h-10 shrink-0 items-stretch border-b">
      <div className="flex min-w-0 flex-1 items-stretch overflow-x-auto">
        {items.map((item) => {
          const isActive = item.id === activeId;
          return (
            <div
              key={item.id}
              className={`group relative flex shrink-0 items-center gap-2 border-r px-3 transition-colors ${
                isActive ? 'bg-card text-foreground' : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
              }`}
            >
              {isActive && (
                <span className="absolute inset-x-0 bottom-0 h-px bg-primary" aria-hidden="true" />
              )}
              <button
                type="button"
                onClick={() => onSelect(item.id)}
                aria-current={isActive ? 'true' : undefined}
                className="flex min-w-0 items-center gap-2 py-2 text-left"
              >
                <StatusDot status={item.status} />
                <span className="max-w-40 truncate font-mono text-xs" title={item.fileName}>
                  {item.fileName}
                </span>
              </button>
              <button
                type="button"
                aria-label={`Close ${item.fileName}`}
                className="rounded-sm p-0.5 text-muted-foreground/50 opacity-0 transition-opacity hover:bg-secondary hover:text-foreground focus:opacity-100 group-hover:opacity-100"
                onClick={() => onRemove(item.id)}
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            </div>
          );
        })}

        <button
          type="button"
          onClick={onAdd}
          aria-label="Add more files"
          className="flex w-10 shrink-0 items-center justify-center border-r text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
