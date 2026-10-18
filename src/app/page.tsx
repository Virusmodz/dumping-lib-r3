'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { UploadZone } from '@/components/elf-dumper/upload-zone';
import { StatsBar } from '@/components/elf-dumper/stats-bar';
import { ClassExplorer } from '@/components/elf-dumper/class-explorer';
import { DumpView } from '@/components/elf-dumper/dump-view';
import { SymbolsTab } from '@/components/elf-dumper/symbols-tab';
import { Vtables } from '@/components/elf-dumper/vtables';
import { FileSidebar, type BatchItem } from '@/components/elf-dumper/file-sidebar';
import { ExportMenu } from '@/components/elf-dumper/export-menu';
import {
  analyzeFile,
  analyzeElfBytes,
  preloadDumper,
  type AnalyzeSuccess,
} from '@/lib/elf-dumper';
import { Boxes, FileWarning, ShieldCheck, Table2, Zap } from 'lucide-react';

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
  const anyBusy = entries.some((e) => e.status === 'analyzing' || e.status === 'queued');

  /** Sequentially drain the queue of pending entries. */
  const drainQueue = useCallback(async () => {
    if (processingRef.current) return;
    processingRef.current = true;
    try {
      // loop until no entry is left in 'queued'
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
            title: 'Dump complete',
            description: `${res.fileName}: ${res.analysis.classCount} classes, ${res.analysis.funcCount} functions, ${res.analysis.vtableCount} vtables`,
          });
        }
        // switch view to the first finished item of the newest batch
        setActiveId((cur) => (cur === null || cur === next.id ? next.id : cur));
      }
    } finally {
      processingRef.current = false;
    }
  }, [toast]);

  // entriesRef mirror so drainQueue sees the latest state
  const entriesRef = useRef<BatchEntry[]>([]);
  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

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
      // give state a tick to flush before draining
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
          title: 'Dump complete',
          description: `game-sdk.so: ${r.analysis.classCount} classes, ${r.analysis.vtableCount} vtables, ${r.analysis.objectCount} globals`,
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

  const clearAll = useCallback(() => {
    setEntries([]);
    setActiveId(null);
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-zinc-950 text-zinc-100">
      {/* subtle grid backdrop */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(24, 24, 27, 0.9) 1px, transparent 1px), linear-gradient(90deg, rgba(24, 24, 27, 0.9) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}
      />

      <header className="relative z-10 border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-emerald-500/40 bg-emerald-500/10 font-mono text-sm font-bold text-emerald-400"
              aria-hidden="true"
            >
              R3
            </div>
            <div>
              <h1 className="font-mono text-base font-semibold tracking-tight text-zinc-50 sm:text-lg">
                Dumping LIB <span className="text-emerald-500">R3</span>
                <span className="ml-2 rounded border border-emerald-800/60 bg-emerald-950/60 px-1.5 py-0.5 align-middle font-mono text-[10px] font-normal text-emerald-400">
                  WebAssembly Edition
                </span>
              </h1>
              <p className="font-mono text-[11px] text-zinc-500">
                ELF class dumper · vtables · globals · batch — C++ core compiled to wasm
              </p>
            </div>
          </div>

          <div className="hidden items-center gap-4 font-mono text-[11px] text-zinc-500 md:flex">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
              100% client-side
            </span>
            <span className="flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5 text-amber-600" aria-hidden="true" />
              web worker engine
            </span>
          </div>
        </div>
      </header>

      {/* hidden input used by the sidebar "add" button */}
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

      <main className="relative z-10 mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        {entries.length === 0 ? (
          <>
            <section aria-label="Introduction" className="mb-8 space-y-4 text-center">
              <h2 className="mx-auto max-w-2xl font-mono text-xl text-zinc-100 sm:text-2xl">
                Reverse-engineer native libraries into{' '}
                <span className="text-emerald-400">C++ class skeletons</span>
              </h2>
              <p className="mx-auto max-w-2xl font-mono text-sm leading-relaxed text-zinc-500">
                Drop ELF images (Android <span className="text-zinc-300">.so</span>,{' '}
                <span className="text-zinc-300">.o</span>, <span className="text-zinc-300">.a</span>)
                and this tool extracts every symbol, demangles the names, rebuilds the class
                structure with method offsets <span className="text-amber-600">and vtables</span> —
                the original CLI logic, now running in your browser via WebAssembly.
              </p>
            </section>
            <UploadZone
              onFiles={enqueueFiles}
              onSample={onSample}
              busy={sampleBusy}
              sampleSize={SAMPLE_SIZE}
            />
          </>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
            <aside aria-label="Analyzed files">
              <FileSidebar
                items={entries}
                activeId={activeId}
                onSelect={setActiveId}
                onRemove={removeEntry}
                onClear={clearAll}
                onAdd={() => addInputRef.current?.click()}
              />
            </aside>

            <section aria-label="Analysis result" className="min-w-0 space-y-6">
              {active === null && (
                <p className="py-16 text-center font-mono text-sm text-zinc-500">
                  select a file to view its analysis
                </p>
              )}

              {active?.status === 'queued' && (
                <p className="py-16 text-center font-mono text-sm text-zinc-500">
                  <span className="text-emerald-500">{active.fileName}</span> is queued…
                </p>
              )}

              {active?.status === 'analyzing' && (
                <div className="space-y-4" aria-busy="true" aria-label="Parsing">
                  <div className="flex items-center justify-center gap-3 py-6">
                    <span className="h-4 w-4 animate-pulse rounded-full bg-emerald-500" />
                    <p className="font-mono text-sm text-emerald-400">
                      scanning symbol tables · demangling · rebuilding vtables…
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Skeleton className="h-8 w-3/4 bg-zinc-800/70" />
                    <Skeleton className="h-8 w-1/2 bg-zinc-800/70" />
                    <Skeleton className="h-40 w-full bg-zinc-800/50" />
                  </div>
                </div>
              )}

              {active?.status === 'error' && (
                <Alert variant="destructive" className="border-red-900/60 bg-red-950/40">
                  <FileWarning className="h-4 w-4" aria-hidden="true" />
                  <AlertTitle className="font-mono">Analysis failed — {active.fileName}</AlertTitle>
                  <AlertDescription className="font-mono text-xs">
                    {active.error}
                  </AlertDescription>
                </Alert>
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

                  <div className="flex justify-end">
                    <ExportMenu result={active.result} />
                  </div>

                  <Tabs defaultValue="explorer" className="w-full">
                    <TabsList className="border border-zinc-800 bg-zinc-900/70 font-mono">
                      <TabsTrigger
                        value="explorer"
                        className="font-mono text-xs data-[state=active]:bg-emerald-950/60 data-[state=active]:text-emerald-300"
                      >
                        <Boxes className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                        <span className="hidden sm:inline">Class Explorer</span>
                        <span className="sm:hidden">Classes</span>
                      </TabsTrigger>
                      <TabsTrigger
                        value="vtables"
                        className="font-mono text-xs data-[state=active]:bg-amber-950/40 data-[state=active]:text-amber-300"
                      >
                        <Table2 className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                        <span className="hidden sm:inline">Vtables</span>
                        <span className="sm:hidden">Vtables</span>
                      </TabsTrigger>
                      <TabsTrigger
                        value="symbols"
                        className="font-mono text-xs data-[state=active]:bg-emerald-950/60 data-[state=active]:text-emerald-300"
                      >
                        Symbols
                      </TabsTrigger>
                      <TabsTrigger
                        value="dump"
                        className="font-mono text-xs data-[state=active]:bg-emerald-950/60 data-[state=active]:text-emerald-300"
                      >
                        dump.cpp
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="explorer" className="mt-4">
                      <ClassExplorer classes={active.result.analysis.classes} />
                    </TabsContent>

                    <TabsContent value="vtables" className="mt-4">
                      <Vtables vtables={active.result.analysis.vtables} />
                    </TabsContent>

                    <TabsContent value="symbols" className="mt-4">
                      <SymbolsTab
                        freeFuncs={active.result.analysis.freeFuncs}
                        objects={active.result.analysis.objects}
                      />
                    </TabsContent>

                    <TabsContent value="dump" className="mt-4">
                      <DumpView
                        dump={active.result.dump}
                        classCount={
                          active.result.analysis.dumpClassCount ??
                          active.result.analysis.classCount
                        }
                      />
                    </TabsContent>
                  </Tabs>
                </>
              )}
            </section>
          </div>
        )}
      </main>

      <footer className="relative z-10 mt-auto border-t border-zinc-800/80 bg-zinc-950/90">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-5 font-mono text-[11px] text-zinc-600 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>
            engine: original <span className="text-zinc-400">&quot;Dumping LIB R3&quot;</span> C++
            sources · ELFIO · Emscripten · web worker
          </p>
          <p>
            your files never leave this tab —{' '}
            <span className="text-emerald-700">no upload, no telemetry</span>
          </p>
        </div>
      </footer>
    </div>
  );
}
