"use client";

// Zona 2 kiri · Gap Finder (USP). Input + contoh → loading shimmer → kandidat
// pertanyaan riset, tiap satu dijembatani dua sitasi + novelty meter. Data dummy
// (plan §7d), tapi CTA "Jembatani celah ini" benar-benar route ke thread Astra.

import { SearchIcon } from "@aqsha/ui/icons";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { GAP_EXAMPLES, GAP_RESULTS, noveltyTag } from "../data/explore-dummy";
import type { GapResult } from "../types";

type Status = "idle" | "loading" | "done";

export function GapFinder() {
  const router = useRouter();
  const [query, setQuery] = useState("Apa yang belum diteliti soal agentic RAG?");
  const [status, setStatus] = useState<Status>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const run = (q?: string) => {
    if (q) setQuery(q);
    setStatus("loading");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setStatus("done"), 850);
  };

  const bridge = (g: GapResult) =>
    router.push(
      `/app/threads?seed=${encodeURIComponent(
        `Jembatani celah riset ini: ${g.question}\n\nSitasi pendukung: ${g.citeA}; ${g.citeB}`,
      )}`,
    );

  return (
    <div className="flex flex-col py-[30px] pr-0 @3xl/explore:pr-[38px]">
      <p className="mb-2.5 font-mono text-[10px] tracking-[0.14em] text-muted-foreground">
        Alat · pencari celah
      </p>
      <div className="mb-2 flex items-center gap-2.5">
        <h3 className="font-heading text-2xl font-semibold tracking-tight text-foreground">Gap Finder</h3>
        <span className="rounded-full bg-primary px-2.5 py-[3px] font-mono text-[10px] text-primary-foreground">
          Khas Aqsha
        </span>
      </div>
      <p className="mb-4 text-[13px] leading-relaxed text-muted-foreground">
        Pertanyaan riset yang belum terjawab — tiap celah dijembatani dari dua sitasi nyata.
      </p>

      <div className="mb-2.5 flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") run();
          }}
          type="text"
          className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3.5 py-3 text-[13.5px] text-foreground outline-none transition-colors focus:border-primary"
        />
        <button
          type="button"
          onClick={() => run()}
          aria-label="Temukan celah"
          className="inline-flex w-[46px] shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-all hover:-translate-y-px hover:brightness-105"
        >
          <SearchIcon className="size-[19px]" />
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {GAP_EXAMPLES.map((ex) => (
          <button
            key={ex}
            type="button"
            onClick={() => run(ex)}
            className="rounded-full border border-border bg-secondary px-2.5 py-1.5 font-mono text-[10.5px] text-muted-foreground transition-colors hover:border-primary hover:text-primary"
          >
            {ex}
          </button>
        ))}
      </div>

      {status === "loading" ? (
        <div className="mt-[18px] flex flex-col gap-3.5">
          <div className="flex items-center gap-2.5 font-mono text-[11px] text-muted-foreground">
            <span className="inline-block size-3 animate-spin rounded-full border-2 border-border border-t-primary" />
            Memindai 142 paper · memetakan celah antar-sitasi…
          </div>
          {GAP_RESULTS.map((g) => (
            <div key={g.num} className="aqsha-shimmer h-16 rounded-2xl border border-border" />
          ))}
        </div>
      ) : status === "done" ? (
        <div className="mt-[18px]">
          <div className="mb-3 flex items-center gap-2">
            <span className="rounded-full bg-primary/10 px-2.5 py-1 font-mono text-[10px] text-primary">
              {GAP_RESULTS.length} celah ditemukan
            </span>
            <span className="font-mono text-[10px] text-muted-foreground">diurut berdasarkan novelty</span>
          </div>
          <div className="flex flex-col">
            {GAP_RESULTS.map((g) => (
              <GapRow key={g.num} g={g} onBridge={() => bridge(g)} />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function GapRow({ g, onBridge }: { g: GapResult; onBridge: () => void }) {
  return (
    <div className="border-t border-border py-[17px]">
      <div className="mb-3 flex items-start gap-2.5">
        <span className="shrink-0 font-heading text-[17px] font-semibold leading-tight text-primary">{g.num}</span>
        <p className="flex-1 text-[14.5px] font-medium leading-snug text-foreground">{g.question}</p>
      </div>

      {/* novelty meter */}
      <div className="mb-3 flex items-center gap-2.5 pl-7">
        <span className="shrink-0 font-mono text-[9.5px] tracking-wide text-muted-foreground">Novelty</span>
        <span className="h-[5px] max-w-[150px] flex-1 overflow-hidden rounded-full bg-muted">
          <span
            className="aqsha-bar-grow block h-full rounded-full bg-gradient-to-r from-primary/55 to-primary"
            style={{ width: `${g.novelty}%` }}
          />
        </span>
        <span className="shrink-0 font-mono text-[11px] font-medium text-primary">{g.novelty}%</span>
        <span className="shrink-0 rounded-full bg-secondary px-2.5 py-[3px] font-mono text-[9.5px] text-muted-foreground">
          {noveltyTag(g.novelty)}
        </span>
      </div>

      {/* the bridge */}
      <div className="flex flex-wrap items-center gap-2.5 pl-7">
        <CiteChip text={g.citeA} />
        <span className="h-px min-w-[30px] flex-1 border-t border-dashed border-primary/50" />
        <span className="aqsha-node-pulse inline-flex h-4 items-center rounded-full border-[1.5px] border-primary px-1.5 font-mono text-[9px] text-primary">
          celah
        </span>
        <span className="h-px min-w-[30px] flex-1 border-t border-dashed border-primary/50" />
        <CiteChip text={g.citeB} />
      </div>

      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={onBridge}
          className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-3 py-1.5 text-[12px] font-medium text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
        >
          Jembatani celah ini →
        </button>
      </div>
    </div>
  );
}

function CiteChip({ text }: { text: string }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-mint-soft-border bg-mint-soft px-2.5 py-1 font-mono text-[10px] text-mint-foreground">
      <span className="text-mint-foreground">✓</span>
      {text}
    </span>
  );
}
