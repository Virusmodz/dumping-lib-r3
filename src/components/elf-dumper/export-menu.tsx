'use client';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { downloadDump, downloadIdaScript, downloadJson, type AnalyzeSuccess } from '@/lib/elf-dumper';
import { Braces, ChevronDown, Download, FileCode2, Terminal } from 'lucide-react';

interface ExportMenuProps {
  result: AnalyzeSuccess;
}

export function ExportMenu({ result }: ExportMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="sm"
          className="bg-emerald-700 font-mono text-xs text-emerald-50 hover:bg-emerald-600"
        >
          <Download className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
          export
          <ChevronDown className="ml-1 h-3 w-3" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="border-zinc-800 bg-zinc-900 font-mono text-xs"
      >
        <DropdownMenuLabel className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
          export analysis
        </DropdownMenuLabel>
        <DropdownMenuItem
          className="font-mono text-xs text-zinc-200 focus:bg-emerald-950/50 focus:text-emerald-200"
          onClick={() => downloadDump(result.fileName, result.dump)}
        >
          <FileCode2 className="mr-2 h-3.5 w-3.5 text-emerald-500" aria-hidden="true" />
          dump.cpp <span className="ml-auto text-zinc-600">original format</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          className="font-mono text-xs text-zinc-200 focus:bg-emerald-950/50 focus:text-emerald-200"
          onClick={() => downloadJson(result.fileName, result)}
        >
          <Braces className="mr-2 h-3.5 w-3.5 text-sky-500" aria-hidden="true" />
          analysis.json <span className="ml-auto text-zinc-600">full data</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator className="bg-zinc-800" />
        <DropdownMenuItem
          className="font-mono text-xs text-zinc-200 focus:bg-emerald-950/50 focus:text-emerald-200"
          onClick={() => downloadIdaScript(result.fileName, result)}
        >
          <Terminal className="mr-2 h-3.5 w-3.5 text-amber-500" aria-hidden="true" />
          ida_rename.py <span className="ml-auto text-zinc-600">IDAPython</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
