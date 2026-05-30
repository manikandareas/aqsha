"use client";

import { ChevronLeftIcon, ChevronRightIcon, Loader2Icon } from "lucide-react";
import { useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { Button } from "@/components/ui/button";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

export function PdfArtifactViewer({
  url,
  fileName,
}: {
  url: string;
  fileName: string;
}) {
  const [pageCount, setPageCount] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-[8px] border border-border bg-card px-3 py-2">
        <span className="min-w-0 truncate text-[12px] font-semibold text-foreground">
          {fileName}
        </span>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            disabled={pageNumber <= 1}
            onClick={() => setPageNumber((current) => Math.max(1, current - 1))}
            aria-label="Halaman sebelumnya"
          >
            <ChevronLeftIcon className="size-4" />
          </Button>
          <span className="min-w-20 text-center text-[12px] font-medium text-muted-foreground">
            {pageNumber} / {pageCount || "-"}
          </span>
          <Button
            type="button"
            variant="outline"
            size="icon"
            disabled={pageCount === 0 || pageNumber >= pageCount}
            onClick={() => setPageNumber((current) => Math.min(pageCount, current + 1))}
            aria-label="Halaman berikutnya"
          >
            <ChevronRightIcon className="size-4" />
          </Button>
        </div>
      </div>
      <div className="grid min-h-[640px] place-items-center overflow-auto rounded-[8px] border border-border bg-muted/25 p-3">
        <Document
          file={url}
          loading={
            <span className="inline-flex items-center gap-2 text-[13px] font-medium text-muted-foreground">
              <Loader2Icon className="size-4 animate-spin" />
              Memuat PDF…
            </span>
          }
          error={
            <p className="text-[13px] font-medium text-destructive">
              PDF tidak bisa dirender.
            </p>
          }
          onLoadSuccess={({ numPages }) => {
            setPageCount(numPages);
            setPageNumber((current) => Math.min(current, numPages));
          }}
        >
          <Page
            pageNumber={pageNumber}
            renderAnnotationLayer
            renderTextLayer
            width={Math.min(860, typeof window === "undefined" ? 860 : window.innerWidth - 80)}
          />
        </Document>
      </div>
    </div>
  );
}
