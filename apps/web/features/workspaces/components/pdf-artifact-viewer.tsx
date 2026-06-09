"use client";

import { AlertCircleIcon, Loader2Icon } from "@aqsha/ui/icons";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { Document, Page, pdfjs } from "react-pdf";
import { useEffect, useRef, useState, type ReactNode } from "react";

// react-pdf renders three stacked layers per page; these stylesheets position
// the transparent text layer (selection/search) and the annotation layer
// (citation links) over the canvas.
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

// Worker is resolved from the installed pdfjs-dist so the API and worker
// versions always match. This module is only imported client-side (the viewer
// is a `dynamic(..., { ssr: false })` import), so `import.meta.url` is safe.
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

// cMaps + standard fonts are copied into /public/pdf by scripts/copy-pdf-assets.mjs.
const documentOptions = {
  cMapUrl: "/pdf/cmaps/",
  cMapPacked: true,
  standardFontDataUrl: "/pdf/standard_fonts/",
};

const MAX_PAGE_WIDTH = 820;
const EAGER_PAGE_COUNT = 2;
const ANNOTATION_SCAN_PAGES = 4;
// Inline citation markers: [26], [3, 5], [12–14].
const CITATION_PATTERN = /\[\d{1,3}(?:\s*[,–-]\s*\d{1,3})*\]/g;

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Tier-2 fallback: when a PDF carries no real hyperlinks, mark inline citation
 * tokens in the text layer so the reader can still spot them. The returned
 * string is injected as innerHTML, so every segment is escaped.
 */
function highlightCitations(item: { str: string }) {
  const { str } = item;
  if (!str) return str;
  let out = "";
  let lastIndex = 0;
  for (const match of str.matchAll(CITATION_PATTERN)) {
    const start = match.index ?? 0;
    out += escapeHtml(str.slice(lastIndex, start));
    out += `<mark class="aqsha-cite-token">${escapeHtml(match[0])}</mark>`;
    lastIndex = start + match[0].length;
  }
  out += escapeHtml(str.slice(lastIndex));
  return out;
}

function scrollToPage(pageNumber: number) {
  document
    .getElementById(`pdf-page-${pageNumber}`)
    ?.scrollIntoView({ behavior: "smooth", block: "start" });
}

// Internal (in-document) citation links resolve to a page; jump there.
function handlePdfItemClick({ pageNumber }: { pageNumber: number }) {
  if (pageNumber) scrollToPage(pageNumber);
}

export function PdfArtifactViewer({ url }: { url: string }) {
  const [numPages, setNumPages] = useState(0);
  const [pageWidth, setPageWidth] = useState(0);
  // Assume native links until detection proves otherwise, so we never decorate
  // a normal hyperlinked paper with the Tier-2 fallback marks.
  const [hasNativeLinks, setHasNativeLinks] = useState(true);
  const numPagesRef = useRef(0);

  // Measure the column width (and own the Tier-2 click delegation) through a ref
  // callback so there is no mount effect and no stale closure over `numPages`.
  const attachContainer = (node: HTMLDivElement | null) => {
    if (!node) return;
    const measure = () => {
      const width = node.clientWidth;
      if (width > 0) setPageWidth(Math.min(width, MAX_PAGE_WIDTH));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);

    // Tier-2 marks aren't real links; clicking one jumps toward the reference
    // list (typically the final pages). Honest best-effort — without embedded
    // hyperlinks there are no per-entry coordinates to resolve a precise target.
    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.classList.contains("aqsha-cite-token") && numPagesRef.current > 0) {
        scrollToPage(numPagesRef.current);
      }
    };
    node.addEventListener("click", handleClick);

    return () => {
      observer.disconnect();
      node.removeEventListener("click", handleClick);
    };
  };

  const handleLoadSuccess = async (pdf: PDFDocumentProxy) => {
    numPagesRef.current = pdf.numPages;
    setNumPages(pdf.numPages);
    try {
      const pageNumbers = Array.from(
        { length: Math.min(pdf.numPages, ANNOTATION_SCAN_PAGES) },
        (_, index) => index + 1,
      );
      const annotationGroups = await Promise.all(
        pageNumbers.map(async (pageNumber) => {
          const page = await pdf.getPage(pageNumber);
          return page.getAnnotations();
        }),
      );
      const found = annotationGroups.some((group) =>
        group.some(
          (annotation) =>
            annotation.subtype === "Link" && (annotation.url || annotation.dest),
        ),
      );
      setHasNativeLinks(found);
    } catch {
      setHasNativeLinks(true);
    }
  };

  const customTextRenderer = hasNativeLinks ? undefined : highlightCitations;
  const pages = Array.from({ length: numPages }, (_, index) => index + 1);

  return (
    <div ref={attachContainer} className="w-full">
      <Document
        file={url}
        options={documentOptions}
        onLoadSuccess={handleLoadSuccess}
        onItemClick={handlePdfItemClick}
        externalLinkTarget="_blank"
        externalLinkRel="noreferrer"
        loading={
          <PdfMessage icon={<Loader2Icon className="size-4 animate-spin" />}>
            Loading PDF…
          </PdfMessage>
        }
        error={
          <PdfMessage icon={<AlertCircleIcon className="size-4 text-destructive" />}>
            We couldn&apos;t display this PDF.
          </PdfMessage>
        }
        noData={<PdfMessage>No PDF to display.</PdfMessage>}
        className="flex w-full flex-col items-center gap-5"
      >
        {pageWidth > 0
          ? pages.map((pageNumber) => (
              <LazyPdfPage
                key={`pdf-page-${pageNumber}`}
                pageNumber={pageNumber}
                width={pageWidth}
                customTextRenderer={customTextRenderer}
              />
            ))
          : null}
      </Document>
    </div>
  );
}

function LazyPdfPage({
  pageNumber,
  width,
  customTextRenderer,
}: {
  pageNumber: number;
  width: number;
  customTextRenderer?: (item: { str: string }) => string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(pageNumber <= EAGER_PAGE_COUNT);
  // A4 portrait aspect keeps the scroll height stable before a page paints.
  const estimatedHeight = Math.round(width * 1.414);

  useEffect(() => {
    if (visible) return;
    const element = ref.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "800px 0px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [visible]);

  return (
    <div
      ref={ref}
      id={`pdf-page-${pageNumber}`}
      className="aqsha-pdf-page"
      style={{ width }}
    >
      {visible ? (
        <Page
          pageNumber={pageNumber}
          width={width}
          customTextRenderer={customTextRenderer}
          renderTextLayer
          renderAnnotationLayer
          loading={<div style={{ height: estimatedHeight }} />}
        />
      ) : (
        <div style={{ height: estimatedHeight }} />
      )}
    </div>
  );
}

function PdfMessage({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-[280px] items-center justify-center gap-2 text-[13px] font-medium text-muted-foreground">
      {icon}
      {children}
    </div>
  );
}
