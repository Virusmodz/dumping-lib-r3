'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { UploadZone } from '@/components/elf-dumper/upload-zone';
import { StatsBar } from '@/components/elf-dumper/stats-bar';
import { ClassExplorer } from '@/components/elf-dumper/class-explorer';
import { DumpView } from '@/components/elf-dumper/dump-view';
import { SymbolsTab } from '@/components/elf-dumper/symbols-tab';
import { Vtables } from '@/components/elf-dumper/vtables';
import { FileTabs, type BatchItem } from '@/components/elf-dumper/file-tabs';
import { ExportMenu } from '@/components/elf-dumper/export-menu';
import {
  analyzeFile,
  analyzeElfBytes,
  preloadDumper,
  type AnalyzeSuccess,
} from '@/lib/elf-dumper';
import { Github, TriangleAlert } from 'lucide-react';

const SAMPLE_URL = `${process.env.NEXT_PUBLIC_BASE_PATH || ''}/sample/game-sdk.so`;
const SAMPLE_SIZE = 23088;

interface BatchEntry extends BatchItem {
  result?: AnalyzeSuccess;
  file?: File;
}

export default function Home() {
  const { toast } = useToast();
  const [entries, setEntries] = useState<BatchEntry[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [sampleBusy, setSampleBusy] = useState(false);
  const addInputRef = useRef<HTMLInputElement>(null);
  const entryIdRef = useRef(0);
  const processingRef = useRef(false);

  // Pre-warm the WASM worker as soon as the page mounts
  useEffect(() => {
    preloadDumper();
  }, []);

  const active = entries.find((e) => e.id === activeId) || null;

  /** Mirror of entries so drainQueue always sees the latest state. */
  const entriesRef = useRef<BatchEntry[]>([]);
  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

  /** Sequentially drain the queue of pending entries. */
  const drainQueue = useCallback(async () => {
    if (processingRef.current) return;
    processingRef.current = true;
    try {
      for (;;) {
        const next = entriesRef.current.find((e) => e.status === 'queued');
        if (!next) break;

        setEntries((prev) =>
          prev.map((e) => (e.id === next.id ? { ...e, status: 'analyzing' } : e))
        );

        if (!next.file) {
          setEntries((prev) =>
            prev.map((e) =>
              e.id === next.id
                ? { ...e, status: 'error', error: 'Internal error: file reference lost' }
                : e
            )
          );
          continue;
        }

        const res = await analyzeFile(next.file);

        setEntries((prev) =>
          prev.map((e) =>
            e.id === next.id
              ? {
                  ...e,
                  status: res.ok ? 'done' : 'error',
                  classCount: res.ok ? res.analysis.classCount : undefined,
                  result: res.ok ? res : undefined,
                  error: res.ok ? undefined : res.error,
                  fileSize: res.fileSize,
                }
              : e
          )
        );
        if (res.ok) {
          toast({
            title: 'Analysis complete',
            description: `${res.fileName} — ${res.analysis.classCount} classes, ${res.analysis.vtableCount} vtables`,
          });
        }
        setActiveId((cur) => (cur === null || cur === next.id ? next.id : cur));
      }
    } finally {
      processingRef.current = false;
    }
  }, [toast]);

  const enqueueFiles = useCallback(
    (files: File[]) => {
      const newEntries: BatchEntry[] = files.map((file) => ({
        id: `f${++entryIdRef.current}`,
        fileName: file.name,
        fileSize: file.size,
        status: 'queued',
        file,
      }));
      setEntries((prev) => [...prev, ...newEntries]);
      if (entriesRef.current.length === 0) {
        setActiveId(newEntries[0]?.id ?? null);
      }
      setTimeout(() => void drainQueue(), 0);
    },
    [drainQueue]
  );

  const onSample = useCallback(async () => {
    setSampleBusy(true);
    try {
      const res = await fetch(SAMPLE_URL);
      if (!res.ok) throw new Error(`Failed to fetch sample (${res.status})`);
      const bytes = new Uint8Array(await res.arrayBuffer());
      const sampleSize = bytes.length; // capture before the worker transfer detaches
      const id = `f${++entryIdRef.current}`;
      setEntries((prev) => [
        ...prev,
        { id, fileName: 'game-sdk.so', fileSize: sampleSize, status: 'analyzing' },
      ]);
      setActiveId(id);
      const r = await analyzeElfBytes('game-sdk.so', bytes);
      setEntries((prev) =>
        prev.map((e) =>
          e.id === id
            ? {
                ...e,
                status: r.ok ? 'done' : 'error',
                classCount: r.ok ? r.analysis.classCount : undefined,
                result: r.ok ? r : undefined,
                error: r.ok ? undefined : r.error,
              }
            : e
        )
      );
      if (r.ok) {
        toast({
          title: 'Analysis complete',
          description: `game-sdk.so — ${r.analysis.classCount} classes, ${r.analysis.vtableCount} vtables`,
        });
      }
    } catch (e) {
      toast({
        title: 'Sample failed',
        description: (e as Error).message,
        variant: 'destructive',
      });
    } finally {
      setSampleBusy(false);
    }
  }, [toast]);

  const removeEntry = useCallback((id: string) => {
    setEntries((prev) => prev.filter((e) => e.id !== id));
    setActiveId((cur) => {
      if (cur !== id) return cur;
      const rest = entriesRef.current.filter((e) => e.id !== id);
      return rest.length > 0 ? rest[rest.length - 1].id : null;
    });
  }, []);

  // Hidden input used by the tab-bar "+" button
  const onAddClick = useCallback(() => addInputRef.current?.click(), []);

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      {/* hidden file input */}
      <input
        ref={addInputRef}
        type="file"
        multiple
        className="sr-only"
        accept=".so,.bin,.elf,.o,.a,application/octet-stream"
        aria-label="Add libraries to analyze"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            enqueueFiles(Array.from(e.target.files));
          }
          e.target.value = '';
        }}
      />

      <header className="flex h-12 shrink-0 items-center justify-between border-b px-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <svg viewBox="0 0 64 64" className="h-5 w-5 shrink-0" aria-hidden="true">
            <rect x="4" y="10" width="56" height="44" rx="8" fill="none" stroke="#3b82f6" strokeWidth="6"/>
            <path d="M16 24 L28 36 L16 48" fill="none" stroke="#60a5fa" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round"/>
            <line x1="33" y1="48" x2="48" y2="48" stroke="#93c5fd" strokeWidth="6" strokeLinecap="round"/>
          </svg>
          <span className="truncate text-[13px] font-semibold tracking-tight">
            Dumping LIB R3
          </span>
          <span className="hidden shrink-0 rounded bg-secondary px-1.5 py-px text-[10px] font-medium text-muted-foreground sm:inline">
            WASM
          </span>
        </div>
        <a
          href="https://github.com/Virusmodz/dumping-lib-r3"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="GitHub repository"
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Github className="h-4 w-4" aria-hidden="true" />
        </a>
      </header>

      {entries.length === 0 ? (
        <UploadZone
          onFiles={enqueueFiles}
          onSample={onSample}
          busy={sampleBusy}
          sampleSize={SAMPLE_SIZE}
        />
      ) : (
        <>
          <FileTabs
            items={entries}
            activeId={activeId}
            onSelect={setActiveId}
            onRemove={removeEntry}
            onAdd={onAddClick}
          />

          <div className="flex min-h-0 flex-1 flex-col">
            {active === null && (
              <p className="py-16 text-center text-xs text-muted-foreground">
                Select a file
              </p>
            )}

            {active?.status === 'queued' && (
              <div className="flex items-center justify-center gap-2 py-16" aria-busy="true">
                <Skeleton className="h-3.5 w-3.5 rounded-full" />
                <p className="text-xs text-muted-foreground">{active.fileName} — queued</p>
              </div>
            )}

            {active?.status === 'analyzing' && (
              <div className="flex flex-col items-center justify-center gap-4 py-16" aria-busy="true" aria-label="Parsing">
                <p className="text-xs text-muted-foreground">Analyzing {active.fileName}…</p>
                <div className="w-64 space-y-2">
                  <Skeleton className="h-6 w-full" />
                  <Skeleton className="h-6 w-3/4" />
                  <Skeleton className="h-6 w-1/2" />
                </div>
              </div>
            )}

            {active?.status === 'error' && (
              <div className="flex flex-col items-center justify-center gap-3 py-16 px-4">
                <TriangleAlert className="h-5 w-5 text-destructive" aria-hidden="true" />
                <p className="text-sm font-medium">Analysis failed — {active.fileName}</p>
                <p className="max-w-md break-all text-center font-mono text-xs text-muted-foreground">
                  {active.error}
                </p>
              </div>
            )}

            {active?.status === 'done' && active.result && (
              <>
                <StatsBar
                  fileName={active.result.fileName}
                  fileSize={active.result.fileSize}
                  analysis={active.result.analysis}
                  durationMs={active.result.durationMs}
                  engine={active.result.engine}
                />

                <Tabs defaultValue="explorer" className="flex min-h-0 flex-1 flex-col">
                  <TabsList className="h-9 w-full shrink-0 justify-start gap-0 rounded-none border-b bg-transparent p-0">
                    <TabsTrigger
                      value="explorer"
                      className="rounded-none border-b-2 border-transparent bg-transparent px-4 text-xs shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                    >
                      Classes
                    </TabsTrigger>
                    <TabsTrigger
                      value="vtables"
                      className="rounded-none border-b-2 border-transparent bg-transparent px-4 text-xs shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                    >
                      Vtables
                    </TabsTrigger>
                    <TabsTrigger
                      value="symbols"
                      className="rounded-none border-b-2 border-transparent bg-transparent px-4 text-xs shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                    >
                      Symbols
                    </TabsTrigger>
                    <TabsTrigger
                      value="dump"
                      className="rounded-none border-b-2 border-transparent bg-transparent px-4 font-mono text-xs shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                    >
                      dump.cpp
                    </TabsTrigger>
                    <div className="ml-auto flex items-center pr-2">
                      <ExportMenu result={active.result} />
                    </div>
                  </TabsList>

                  <TabsContent value="explorer" className="mt-0 flex min-h-0 flex-1 flex-col">
                    <ClassExplorer classes={active.result.analysis.classes} />
                  </TabsContent>

                  <TabsContent value="vtables" className="mt-0 flex min-h-0 flex-1 flex-col">
                    <Vtables vtables={active.result.analysis.vtables} />
                  </TabsContent>

                  <TabsContent value="symbols" className="mt-0 flex min-h-0 flex-1 flex-col">
                    <SymbolsTab
                      freeFuncs={active.result.analysis.freeFuncs}
                      objects={active.result.analysis.objects}
                    />
                  </TabsContent>

                  <TabsContent value="dump" className="mt-0 flex min-h-0 flex-1 flex-col">
                    <DumpView
                      dump={active.result.dump}
                      fileName={active.result.fileName}
                      classCount={
                        active.result.analysis.dumpClassCount ??
                        active.result.analysis.classCount
                      }
                    />
                  </TabsContent>
                </Tabs>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
