"use client";

// Zona 2 kiri · Gap Finder (USP). Input + contoh men-set query `q` halaman → analisis
// background (/explore/analysis, LLM atas abstrak paper) → kandidat pertanyaan riset,
// tiap satu dijembatani dua sitasi + novelty meter. CTA "Jembatani celah ini" route ke
// thread Astra. Status didorong dari hasil analisis halaman.

import { SearchIcon } from "@aqsha/ui/icons";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { GAP_EXAMPLES, noveltyTag } from "../data/explore-dummy";
import type { GapResult } from "../types";

export type GapStatus = "idle" | "loading" | "ready" | "error";

export function GapFinder({
  q,
  status,
  gaps,
  onSubmitQuery,
}: {
  q: string;
  status: GapStatus;
  gaps: GapResult[];
  onSubmitQuery: (q: string) => void;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState(q);
  // Sinkronkan input saat `q` berubah dari luar (mis. dari ask-bar) — adjust-state-saat-render.
  const [lastQ, setLastQ] = useState(q);
  if (q !== lastQ) {
    setLastQ(q);
    setDraft(q);
  }

  const submit = (value?: string) => {
    const next = (value ?? draft).trim();
    if (next) onSubmitQuery(next);
  };

  const bridge = (g: GapResult) =>
    router.push(
      `/app/threads?seed=${encodeURIComponent(
        `Jembatani celah riset ini: ${g.question}\n\nSitasi pendukung: ${g.citeA}; ${g.citeB}`,
      )}`,
    );

  return (
    <div className="flex flex-col py-[30px] pr-0 @3xl/explore:pr-[38px]">
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
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          type="text"
          placeholder="Topik riset, mis. agentic RAG"
          className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3.5 py-3 text-[13.5px] text-foreground outline-none transition-colors focus:border-primary"
        />
        <button
          type="button"
          onClick={() => submit()}
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
            onClick={() => submit(ex)}
            className="rounded-full border border-border bg-secondary px-2.5 py-1.5 font-mono text-[10.5px] text-muted-foreground transition-colors hover:border-primary hover:text-primary"
          >
            {ex}
          </button>
        ))}
      </div>

      {status === "idle" ? (
        <p className="mt-[18px] font-mono text-[11px] text-muted-foreground">
          Cari topik di atas untuk menemukan celah riset.
        </p>
      ) : status === "loading" ? (
        <div className="mt-[18px] flex flex-col gap-3.5">
          <div className="flex items-center gap-2.5 font-mono text-[11px] text-muted-foreground">
            <span className="inline-block size-3 animate-spin rounded-full border-2 border-border border-t-primary" />
            Membaca abstrak paper · memetakan celah antar-sitasi…
          </div>
          {[0, 1, 2].map((i) => (
            <div key={i} className="aqsha-shimmer h-16 rounded-2xl border border-border" />
          ))}
        </div>
      ) : status === "error" ? (
        <p className="mt-[18px] font-mono text-[11px] text-muted-foreground">
          Gagal menganalisis topik ini. Coba kata kunci lain.
        </p>
      ) : gaps.length === 0 ? (
        <p className="mt-[18px] font-mono text-[11px] text-muted-foreground">
          Tak ada celah menonjol untuk topik ini.
        </p>
      ) : (
        <div className="mt-[18px]">
          <div className="mb-3 flex items-center gap-2">
            <span className="rounded-full bg-primary/10 px-2.5 py-1 font-mono text-[10px] text-primary">
              {gaps.length} celah ditemukan
            </span>
            <span className="font-mono text-[10px] text-muted-foreground">diurut berdasarkan novelty</span>
          </div>
          <div className="flex flex-col">
            {gaps.map((g) => (
              <GapRow key={g.num} g={g} onBridge={() => bridge(g)} />
            ))}
          </div>
        </div>
      )}
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
