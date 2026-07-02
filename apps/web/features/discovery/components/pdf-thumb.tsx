"use client";

// Thumbnail halaman-1 PDF paper untuk kartu Explore. Render via react-pdf/pdfjs
// (setup worker identik dgn pdf-artifact-viewer). PDF arXiv/publisher kena CORS →
// di-fetch lewat proxy API `/papers/pdf-proxy` (provenance-checked, Range passthrough
// → pdf.js cukup tarik chunk halaman pertama). Lazy in-view; gagal/timeout → `onFail()`
// supaya kartu jatuh ke cover generatif. Dimuat via `dynamic(ssr:false)` dari
// discovery-item-card (pdfjs tak boleh dieval saat SSR).
//
// Sebelum menyerahkan URL ke pdf.js, kita PROBE murah (1 byte) dulu: PDF paywall/
// rusak (502/HTML/404) ditangani di sini sehingga pdf.js tak pernah melihat URL gagal
// → nol noise console (ResponseException/InvalidPDF). Skeleton tampil selama loading.

import { useCallback, useEffect, useRef, useState } from "react";
import { Document, Page } from "@/lib/pdf-worker";
import { cn } from "@/lib/utils";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

// disableAutoFetch + stream aktif → pdf.js pakai HTTP Range (cukup halaman 1).
// Tanpa cMap/standardFont assets (tak ada di /public) — PDF Latin/font-embed (arXiv
// dsb.) tetap ter-render; kasus gagal jatuh ke cover generatif. verbosity 0 = senyap.
const documentOptions = {
  disableAutoFetch: true,
  disableStream: false,
  verbosity: 0,
};

const RENDER_TIMEOUT_MS = 12_000;
// Probe pra-render hanya di dev (lihat effect di bawah). Di prod render langsung saat in-view.
const SKIP_PROBE = process.env.NODE_ENV === "production";

export function PdfThumb({ pdfUrl, onFail }: { pdfUrl: string; onFail: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const failedRef = useRef(false);
  const onFailRef = useRef(onFail);
  const [inView, setInView] = useState(false);
  const [width, setWidth] = useState(0);
  const [probeOk, setProbeOk] = useState(false);
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    onFailRef.current = onFail;
  }, [onFail]);

  const fail = useCallback(() => {
    if (failedRef.current) return;
    failedRef.current = true;
    onFailRef.current();
  }, []);

  // Ukur lebar kartu + lazy in-view.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      if (w > 0) setWidth(w);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          io.disconnect();
        }
      },
      { rootMargin: "500px" },
    );
    io.observe(el);
    return () => {
      ro.disconnect();
      io.disconnect();
    };
  }, []);

  const file = `${API_BASE}/papers/pdf-proxy?u=${encodeURIComponent(pdfUrl)}`;

  // Probe murah HANYA di dev: status + content-type proxy → fallback tanpa melibatkan
  // pdf.js (fetch tak throw utk status HTTP → nol noise console saat development). Di prod
  // probe dilewati (SKIP_PROBE): hemat 1 round-trip + separuh beban upstream per thumbnail,
  // dan onLoadError/onSourceError pdf.js tetap menjaring gagal → cover generatif (noise
  // console prod tak terlihat user).
  useEffect(() => {
    if (SKIP_PROBE || !inView) return;
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch(file, {
          headers: { Range: "bytes=0-0" },
          signal: controller.signal,
        });
        const type = res.headers.get("content-type") ?? "";
        // Hentikan unduhan; cukup butuh header.
        await res.body?.cancel().catch(() => {});
        // Probe bisa resolve SETELAH effect di-teardown (item berganti / unmount); abort
        // tak membatalkan response yang sudah resolve, jadi cek manual sebelum setState/fail
        // supaya tak men-fail item yang salah (selaras guard di cabang catch).
        if (controller.signal.aborted) return;
        if (!res.ok || !type.includes("pdf")) {
          fail();
          return;
        }
        setProbeOk(true);
      } catch {
        if (!controller.signal.aborted) fail();
      }
    })();
    return () => controller.abort();
  }, [inView, file, fail]);

  // Di prod render langsung saat in-view (probe dilewati); di dev tunggu probe lolos.
  const readyToRender = SKIP_PROBE ? inView : probeOk;

  // Guard render menggantung (proxy/host lambat) → fallback setelah ambang.
  useEffect(() => {
    if (!readyToRender || rendered) return;
    const timer = window.setTimeout(fail, RENDER_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [readyToRender, rendered, fail]);

  return (
    <div
      ref={ref}
      aria-hidden
      className="absolute inset-0 overflow-hidden [&_.react-pdf__Page]:!bg-transparent [&_canvas]:!h-auto [&_canvas]:!w-full"
    >
      {readyToRender && width > 0 ? (
        <Document
          file={file}
          options={documentOptions}
          loading={null}
          error={null}
          noData={null}
          onLoadError={fail}
          onSourceError={fail}
        >
          <Page
            pageNumber={1}
            width={width}
            renderTextLayer={false}
            renderAnnotationLayer={false}
            loading={null}
            onRenderSuccess={() => setRendered(true)}
            onRenderError={fail}
          />
        </Document>
      ) : null}

      {/* Skeleton selama loading (mulai in-view sampai page-1 ter-render). Sebelum
          in-view & saat gagal: transparan → cover generatif di belakang yang tampil. */}
      <div
        className={cn(
          "pointer-events-none absolute inset-0 bg-muted transition-opacity duration-300",
          inView && !rendered ? "animate-pulse opacity-100" : "opacity-0",
        )}
      >
        <div className="absolute inset-x-4 top-4 space-y-2">
          <div className="h-2 w-3/4 rounded-full bg-foreground/10" />
          <div className="h-2 w-1/2 rounded-full bg-foreground/10" />
        </div>
      </div>
    </div>
  );
}
