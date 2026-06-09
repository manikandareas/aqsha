"use client";

import {
  CopyIcon,
  DownloadIcon,
  MaximizeIcon,
  MoreVerticalIcon,
} from "@aqsha/ui/icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

import type { ComponentProps } from "react";
import { useRef, useState } from "react";
import {
  extractTableDataFromElement,
  tableDataToCSV,
  tableDataToMarkdown,
  tableDataToTSV,
} from "streamdown";

type TableBlockProps = ComponentProps<"table"> & {
  node?: unknown;
};

export function TableBlock({ children, className, node: _node, ...props }: TableBlockProps) {
  const tableRef = useRef<HTMLTableElement>(null);
  const [fullscreen, setFullscreen] = useState(false);

  const copy = async (format: "csv" | "tsv" | "md") => {
    const table = tableRef.current;
    if (!table) return;
    try {
      const data = extractTableDataFromElement(table);
      const text =
        format === "csv"
          ? tableDataToCSV(data)
          : format === "tsv"
            ? tableDataToTSV(data)
            : tableDataToMarkdown(data);
      await navigator.clipboard.writeText(text);
    } catch {
      // silently ignore clipboard errors
    }
  };

  const download = (format: "csv" | "md") => {
    const table = tableRef.current;
    if (!table) return;
    const data = extractTableDataFromElement(table);
    const text = format === "csv" ? tableDataToCSV(data) : tableDataToMarkdown(data);
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `table.${format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <div className="relative my-5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Table actions"
              className="absolute top-1.5 right-2 z-10 inline-flex size-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:text-foreground focus-visible:outline-none"
            >
              <MoreVerticalIcon size={13} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuLabel>Copy</DropdownMenuLabel>
            <DropdownMenuItem onSelect={() => copy("csv")}>
              <CopyIcon /> CSV
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => copy("md")}>
              <CopyIcon /> Markdown
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => copy("tsv")}>
              <CopyIcon /> TSV
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Download</DropdownMenuLabel>
            <DropdownMenuItem onSelect={() => download("csv")}>
              <DownloadIcon /> Download CSV
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => download("md")}>
              <DownloadIcon /> Download Markdown
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => setFullscreen(true)}>
              <MaximizeIcon /> View fullscreen
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="overflow-x-auto">
          <table
            ref={tableRef}
            data-streamdown="table"
            className={cn("w-full divide-y divide-border", className)}
            {...props}
          >
            {children}
          </table>
        </div>
      </div>

      <Dialog open={fullscreen} onOpenChange={setFullscreen}>
        <DialogContent className="max-w-4xl overflow-auto p-6 pt-10">
          <div className="aqsha-prose overflow-x-auto">
            <table
              data-streamdown="table"
              className={cn("w-full divide-y divide-border", className)}
              {...props}
            >
              {children}
            </table>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
