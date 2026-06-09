"use client";

import {
  AlertCircleIcon,
  ArrowUpToLineIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  Loader2Icon,
  MaximizeIcon,
  MinimizeIcon,
  MinusIcon,
  PlusIcon,
  SearchIcon,
  XIcon,
} from "@aqsha/ui/icons";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { Document, Page, pdfjs } from "react-pdf";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3;
const ZOOM_STEP = 0.2;
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
 * tokens in the text layer so the reader can still spot them.
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

/** Wrap every case-insensitive occurrence of `query` in a search highlight. */
function highlightQuery(str: string, query: string) {
  if (!str) return str;
  if (!query) return escapeHtml(str);
  const lower = str.toLowerCase();
  const needle = query.toLowerCase();
  let idx = lower.indexOf(needle);
  if (idx === -1) return escapeHtml(str);
  let out = "";
  let from = 0;
  while (idx !== -1) {
    out += escapeHtml(str.slice(from, idx));
    out += `<mark class="aqsha-search-hit">${escapeHtml(str.slice(idx, idx + needle.length))}</mark>`;
    from = idx + needle.length;
    idx = lower.indexOf(needle, from);
  }
  out += escapeHtml(str.slice(from));
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

async function extractPageTexts(pdf: PDFDocumentProxy) {
  const pageNumbers = Array.from({ length: pdf.numPages }, (_, index) => index + 1);
  return Promise.all(
    pageNumbers.map(async (pageNumber) => {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      return content.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ");
    }),
  );
}

export function PdfArtifactViewer({ url }: { url: string }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const pdfRef = useRef<PDFDocumentProxy | null>(null);
  const numPagesRef = useRef(0);
  const pageTextsRef = useRef<string[] | null>(null);

  const [numPages, setNumPages] = useState(0);
  const [fitWidth, setFitWidth] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [hasNativeLinks, setHasNativeLinks] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<number[]>([]);
  const [activeMatch, setActiveMatch] = useState(0);

  const pageWidth = fitWidth > 0 ? Math.max(240, Math.round(fitWidth * zoom)) : 0;
  const hasPages = numPages > 0 && pageWidth > 0;

  // Measure the column width (and own the Tier-2 click delegation) through a ref
  // callback so there is no mount effect and no stale closure over `numPages`.
  const attachContainer = (node: HTMLDivElement | null) => {
    if (!node) return;
    const measure = () => {
      const width = node.clientWidth;
      if (width > 0) setFitWidth(Math.min(width, MAX_PAGE_WIDTH));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);

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
    pdfRef.current = pdf;
    pageTextsRef.current = null;
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

  // Track which page is under the vertical centre of the viewport.
  useEffect(() => {
    if (!hasPages) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const pageNumber = Number(entry.target.getAttribute("data-page"));
            if (pageNumber) setCurrentPage(pageNumber);
          }
        }
      },
      { rootMargin: "-45% 0px -45% 0px", threshold: 0 },
    );
    for (let pageNumber = 1; pageNumber <= numPages; pageNumber += 1) {
      const element = document.getElementById(`pdf-page-${pageNumber}`);
      if (element) observer.observe(element);
    }
    return () => observer.disconnect();
  }, [hasPages, numPages]);

  // Track fullscreen state so the toggle icon stays in sync.
  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // Debounced full-document search over extracted page text.
  useEffect(() => {
    if (!searchOpen) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const trimmed = searchInput.trim();
      if (!trimmed) {
        setQuery("");
        setMatches([]);
        setActiveMatch(0);
        return;
      }
      const pdf = pdfRef.current;
      if (!pdf) return;
      if (!pageTextsRef.current) pageTextsRef.current = await extractPageTexts(pdf);
      if (cancelled) return;
      const needle = trimmed.toLowerCase();
      const found: number[] = [];
      pageTextsRef.current.forEach((text, index) => {
        const lower = text.toLowerCase();
        let at = lower.indexOf(needle);
        while (at !== -1) {
          found.push(index + 1);
          at = lower.indexOf(needle, at + needle.length);
        }
      });
      setQuery(trimmed);
      setMatches(found);
      setActiveMatch(0);
      if (found.length > 0) scrollToPage(found[0]);
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [searchInput, searchOpen]);

  const goToMatch = (index: number) => {
    if (matches.length === 0) return;
    const next = (index + matches.length) % matches.length;
    setActiveMatch(next);
    scrollToPage(matches[next]);
  };

  const toggleFullscreen = () => {
    const element = rootRef.current;
    if (!element) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void element.requestFullscreen?.();
    }
  };

  const closeSearch = () => {
    setSearchOpen(false);
    setSearchInput("");
    setQuery("");
    setMatches([]);
    setActiveMatch(0);
  };

  let customTextRenderer: ((item: { str: string }) => string) | undefined;
  if (query) {
    customTextRenderer = (item) => highlightQuery(item.str, query);
  } else if (!hasNativeLinks) {
    customTextRenderer = highlightCitations;
  }

  const pages = Array.from({ length: numPages }, (_, index) => index + 1);

  return (
    <div ref={rootRef} className="aqsha-pdf-root relative w-full bg-background">
      <div ref={attachContainer} className="w-full overflow-x-auto">
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
          className="w-full space-y-5"
        >
          {hasPages
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

      {numPages > 0 ? (
        <PdfReaderToolbar
          zoomPercent={Math.round(zoom * 100)}
          canZoomIn={zoom < ZOOM_MAX}
          canZoomOut={zoom > ZOOM_MIN}
          onZoomIn={() => setZoom((value) => Math.min(ZOOM_MAX, Math.round((value + ZOOM_STEP) * 100) / 100))}
          onZoomOut={() => setZoom((value) => Math.max(ZOOM_MIN, Math.round((value - ZOOM_STEP) * 100) / 100))}
          onResetZoom={() => setZoom(1)}
          currentPage={currentPage}
          numPages={numPages}
          onPrev={() => scrollToPage(Math.max(1, currentPage - 1))}
          onNext={() => scrollToPage(Math.min(numPages, currentPage + 1))}
          onTop={() => scrollToPage(1)}
          searchOpen={searchOpen}
          onToggleSearch={() => (searchOpen ? closeSearch() : setSearchOpen(true))}
          searchInput={searchInput}
          onSearchInputChange={setSearchInput}
          matchCount={matches.length}
          activeMatch={activeMatch}
          onNextMatch={() => goToMatch(activeMatch + 1)}
          onPrevMatch={() => goToMatch(activeMatch - 1)}
          onCloseSearch={closeSearch}
          isFullscreen={isFullscreen}
          onToggleFullscreen={toggleFullscreen}
        />
      ) : null}
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
      data-page={pageNumber}
      className="aqsha-pdf-page mx-auto"
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

function PdfReaderToolbar({
  zoomPercent,
  canZoomIn,
  canZoomOut,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  currentPage,
  numPages,
  onPrev,
  onNext,
  onTop,
  searchOpen,
  onToggleSearch,
  searchInput,
  onSearchInputChange,
  matchCount,
  activeMatch,
  onNextMatch,
  onPrevMatch,
  onCloseSearch,
  isFullscreen,
  onToggleFullscreen,
}: {
  zoomPercent: number;
  canZoomIn: boolean;
  canZoomOut: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  currentPage: number;
  numPages: number;
  onPrev: () => void;
  onNext: () => void;
  onTop: () => void;
  searchOpen: boolean;
  onToggleSearch: () => void;
  searchInput: string;
  onSearchInputChange: (value: string) => void;
  matchCount: number;
  activeMatch: number;
  onNextMatch: () => void;
  onPrevMatch: () => void;
  onCloseSearch: () => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
}) {
  return (
    <div className="fixed bottom-5 left-1/2 z-40 flex -translate-x-1/2 flex-col items-center gap-2">
      {searchOpen ? (
        <div className="flex max-w-[calc(100vw-1.5rem)] items-center gap-1 rounded-full border border-border bg-popover/95 px-2 py-1 shadow-md backdrop-blur supports-[backdrop-filter]:bg-popover/80">
          <SearchIcon className="ml-1 size-3.5 shrink-0 text-muted-foreground" />
          <input
            autoFocus
            value={searchInput}
            onChange={(event) => onSearchInputChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                if (event.shiftKey) onPrevMatch();
                else onNextMatch();
              }
              if (event.key === "Escape") onCloseSearch();
            }}
            placeholder="Find in document"
            aria-label="Find in document"
            className="h-7 w-36 min-w-0 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground sm:w-44"
          />
          <span className="shrink-0 px-1 text-[12px] tabular-nums text-muted-foreground">
            {searchInput.trim()
              ? matchCount > 0
                ? `${activeMatch + 1}/${matchCount}`
                : "0/0"
              : ""}
          </span>
          <ToolbarButton label="Previous match" onClick={onPrevMatch} disabled={matchCount === 0}>
            <ChevronUpIcon className="size-4" />
          </ToolbarButton>
          <ToolbarButton label="Next match" onClick={onNextMatch} disabled={matchCount === 0}>
            <ChevronDownIcon className="size-4" />
          </ToolbarButton>
          <ToolbarButton label="Close search" onClick={onCloseSearch}>
            <XIcon className="size-4" />
          </ToolbarButton>
        </div>
      ) : null}

      <div className="flex items-center gap-2">
        {currentPage > 1 ? (
          <button
            type="button"
            onClick={onTop}
            aria-label="Back to top"
            title="Back to top"
            className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border bg-popover/95 text-muted-foreground shadow-md backdrop-blur transition-colors hover:text-foreground supports-[backdrop-filter]:bg-popover/80"
          >
            <ArrowUpToLineIcon className="size-4" />
          </button>
        ) : null}

        <div
          role="toolbar"
          aria-label="PDF reading tools"
          className="flex max-w-[calc(100vw-1.5rem)] items-center gap-0.5 overflow-x-auto rounded-full border border-border bg-popover/95 px-1.5 py-1 shadow-md backdrop-blur supports-[backdrop-filter]:bg-popover/80"
        >
          <ToolbarButton label="Zoom out" onClick={onZoomOut} disabled={!canZoomOut}>
            <MinusIcon className="size-4" />
          </ToolbarButton>
          <button
            type="button"
            onClick={onResetZoom}
            title="Fit width"
            className="min-w-12 shrink-0 rounded-md px-1.5 py-1 text-[12px] font-medium tabular-nums text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {zoomPercent}%
          </button>
          <ToolbarButton label="Zoom in" onClick={onZoomIn} disabled={!canZoomIn}>
            <PlusIcon className="size-4" />
          </ToolbarButton>

          <ToolbarDivider />

          <ToolbarButton label="Previous page" onClick={onPrev} disabled={currentPage <= 1}>
            <ChevronUpIcon className="size-4" />
          </ToolbarButton>
          <span className="shrink-0 px-1 text-[12px] font-medium tabular-nums text-muted-foreground">
            {currentPage} / {numPages}
          </span>
          <ToolbarButton label="Next page" onClick={onNext} disabled={currentPage >= numPages}>
            <ChevronDownIcon className="size-4" />
          </ToolbarButton>

          <ToolbarDivider />

          <ToolbarButton label="Find in document" onClick={onToggleSearch} active={searchOpen}>
            <SearchIcon className="size-4" />
          </ToolbarButton>
          <ToolbarButton
            label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
            onClick={onToggleFullscreen}
          >
            {isFullscreen ? (
              <MinimizeIcon className="size-4" />
            ) : (
              <MaximizeIcon className="size-4" />
            )}
          </ToolbarButton>
        </div>
      </div>
    </div>
  );
}

function ToolbarButton({
  label,
  onClick,
  disabled,
  active,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn("shrink-0", active && "bg-accent text-foreground")}
    >
      {children}
    </Button>
  );
}

function ToolbarDivider() {
  return <span className="mx-0.5 h-5 w-px shrink-0 bg-border" />;
}

function PdfMessage({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-[280px] items-center justify-center gap-2 text-[13px] font-medium text-muted-foreground">
      {icon}
      {children}
    </div>
  );
}
