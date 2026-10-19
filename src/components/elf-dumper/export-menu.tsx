'use client';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { downloadDump, downloadIdaScript, downloadJson, type AnalyzeSuccess } from '@/lib/elf-dumper';
import { ChevronDown, Download } from 'lucide-react';

interface ExportMenuProps {
  result: AnalyzeSuccess;
}

export function ExportMenu({ result }: ExportMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className="h-7 border-input bg-transparent px-2.5 text-xs text-foreground hover:bg-accent"
        >
          <Download className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="hidden sm:inline">Export</span>
          <ChevronDown className="h-3 w-3" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40 text-xs">
        <DropdownMenuItem onClick={() => downloadDump(result.fileName, result.dump)}>
          dump.cpp
          <span className="ml-auto text-muted-foreground/60">offset dump</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => downloadJson(result.fileName, result)}>
          analysis.json
          <span className="ml-auto text-muted-foreground/60">full data</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => downloadIdaScript(result.fileName, result)}>
          ida_rename.py
          <span className="ml-auto text-muted-foreground/60">IDAPython</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
