"use client";

// Fact-sheet aside (sticky di desktop) untuk halaman detail paper Explore. Ditata per
// hirarki kepentingan: (1) Dampak — kartu hero bertint dengan sitasi sebagai angka
// dominan + scientometrics yang DITERJEMAHKAN jadi insight ("Top X%", "1,4× rata-rata
// bidang") + tren sitasi; (2) Publikasi — status akses semantik + DOI salin-cepat +
// metadata; (3) Konteks — topik, afiliasi, pendanaan, SDG. Motion hanya pada interaksi.

import { Badge } from "@aqsha/ui/components/badge";
import { CheckIcon, CopyIcon, TrendingUpIcon } from "@aqsha/ui/icons";
import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { ExplorePaper, PaperYearCount } from "../types";

// Easing fisik (spring-out) selaras dengan primitif reader lain.
const EASE = "ease-[cubic-bezier(0.32,0.72,0,1)]";

// ── Terjemahan scientometrics OpenAlex → label manusiawi ────────────────────
type AccessTone = "open" | "partial" | "closed";
const ACCESS_STATUS: Record<string, { label: string; tone: AccessTone }> = {
  diamond: { label: "Akses terbuka penuh", tone: "open" },
  gold: { label: "Akses terbuka", tone: "open" },
  hybrid: { label: "Akses terbuka", tone: "open" },
  green: { label: "Tersedia di repositori", tone: "partial" },
  bronze: { label: "Gratis di penerbit", tone: "partial" },
  closed: { label: "Akses terbatas", tone: "closed" },
};
const ACCESS_DOT: Record<AccessTone, string> = {
  open: "bg-mint-foreground",
  partial: "bg-lemon-foreground",
  closed: "bg-muted-foreground/45",
};

/** citationPercentile 0–100 (lebih tinggi = lebih sering dikutip dari sebidang) → "Top X%". */
function topPercentLabel(percentile: number): string {
  return `Top ${Math.max(1, 100 - Math.round(percentile))}%`;
}

/** fwci: 1,0 = rata-rata bidang → "1,4×". */
function formatFwci(fwci: number): string {
  return `${fwci.toLocaleString("id-ID", { maximumFractionDigits: 1 })}×`;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function PaperAside({ paper }: { paper: ExplorePaper }) {
  const e = paper.enriched;
  const cites = paper.citedByCount ?? e?.citedByCount;

  const hasImpact =
    !!e &&
    (cites != null || e.fwci != null || e.citationPercentile != null || e.countsByYear.length > 1);

  const journal = e?.journal ?? paper.venue;
  const access = e?.oaStatus
    ? (ACCESS_STATUS[e.oaStatus] ?? { label: e.oaStatus, tone: "partial" as const })
    : paper.isOpenAccess
      ? { label: "Akses terbuka", tone: "open" as const }
      : undefined;
  const license = e?.license;
  const typeLine = [e?.type ? capitalize(e.type) : null, e?.language ? e.language.toUpperCase() : null]
    .filter(Boolean)
    .join(" · ");
  const issn = e?.issn?.[0];
  const concepts = dedupe([...(e?.concepts.map((c) => c.name) ?? []), ...paper.topics]).slice(0, 10);
  const institutions = e?.institutions ?? [];
  const funders = e?.funders ?? [];
  const sdgs = e?.sdgs.map((s) => s.name) ?? [];

  const hasDetails =
    !!journal ||
    !!access ||
    !!paper.doi ||
    !!issn ||
    concepts.length > 0 ||
    institutions.length > 0 ||
    funders.length > 0 ||
    sdgs.length > 0;

  if (!hasImpact && !hasDetails) return null;

  return (
    <aside className="mt-9 min-w-0 space-y-3 @5xl:sticky @5xl:top-6 @5xl:mt-0 @5xl:self-start">
      {hasImpact && e ? (
        <div className="overflow-hidden rounded-2xl border border-border/60 bg-card">
          <div className="bg-muted/25 px-5 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-serif text-[34px] leading-none tracking-tight text-foreground">
                  {cites != null ? cites.toLocaleString("id-ID") : "—"}
                </p>
                <p className="mt-1.5 text-[11px] font-medium text-muted-foreground">Sitasi</p>
              </div>
              {e.citationPercentile != null ? (
                <span
                  className={cn(
                    "shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                    e.citationPercentile >= 75
                      ? "border-mint-soft-border bg-mint-soft text-mint-foreground"
                      : "border-border/70 bg-muted/50 text-muted-foreground",
                  )}
                >
                  {topPercentLabel(e.citationPercentile)}
                </span>
              ) : null}
            </div>

            {e.fwci != null ? (
              <div className="mt-4 flex items-baseline gap-2 border-t border-border/40 pt-3">
                <span
                  className={cn(
                    "font-serif text-[18px] leading-none tracking-tight",
                    e.fwci >= 1 ? "text-mint-foreground" : "text-foreground",
                  )}
                >
                  {formatFwci(e.fwci)}
                </span>
                <span className="text-[11px] leading-tight text-muted-foreground">
                  rata-rata sitasi bidang ini
                </span>
              </div>
            ) : null}
          </div>

          {e.countsByYear.length > 1 ? (
            <div className="px-5 py-4">
              <CitationTrend counts={e.countsByYear} />
            </div>
          ) : null}
        </div>
      ) : null}

      {hasDetails ? (
        <div className="overflow-hidden rounded-2xl border border-border/60 bg-card px-5 divide-y divide-border/50">
          {access || journal || typeLine || paper.doi || issn ? (
            <AsideGroup title="Publikasi">
              {access ? (
                <div className="mb-3 flex items-center gap-2">
                  <span className={cn("size-2 shrink-0 rounded-full", ACCESS_DOT[access.tone])} />
                  <span className="text-[13px] leading-tight text-foreground">{access.label}</span>
                  {license ? (
                    <span className="truncate text-[12px] text-muted-foreground">· {license}</span>
                  ) : null}
                </div>
              ) : null}
              <dl className="space-y-2.5">
                {journal ? <AsideRow label="Jurnal">{journal}</AsideRow> : null}
                {typeLine ? <AsideRow label="Jenis">{typeLine}</AsideRow> : null}
                {paper.doi ? (
                  <AsideRow label="DOI">
                    <DoiValue doi={paper.doi} />
                  </AsideRow>
                ) : null}
                {issn ? <AsideRow label="ISSN">{issn}</AsideRow> : null}
              </dl>
            </AsideGroup>
          ) : null}

          {concepts.length > 0 ? (
            <AsideGroup title="Topik & konsep">
              <div className="flex flex-wrap gap-1.5">
                {concepts.map((c) => (
                  <Badge key={c} variant="secondary" className="font-normal">
                    {c}
                  </Badge>
                ))}
              </div>
            </AsideGroup>
          ) : null}

          {institutions.length > 0 ? (
            <AsideGroup title="Afiliasi">
              <p className="text-[13px] leading-relaxed text-muted-foreground">
                {institutions.join(" · ")}
              </p>
            </AsideGroup>
          ) : null}

          {funders.length > 0 ? (
            <AsideGroup title="Pendanaan">
              <p className="text-[13px] leading-relaxed text-muted-foreground">{funders.join(" · ")}</p>
            </AsideGroup>
          ) : null}

          {sdgs.length > 0 ? (
            <AsideGroup title="Tujuan pembangunan berkelanjutan">
              <div className="flex flex-wrap gap-1.5">
                {sdgs.map((s) => (
                  <Badge key={s} variant="outline" className="font-normal">
                    {s}
                  </Badge>
                ))}
              </div>
            </AsideGroup>
          ) : null}
        </div>
      ) : null}
    </aside>
  );
}

/** Tren sitasi per tahun — bar puncak disorot penuh, lain redup; caption tahun puncak. */
function CitationTrend({ counts }: { counts: PaperYearCount[] }) {
  const max = Math.max(1, ...counts.map((c) => c.citedByCount));
  const peak = counts.reduce((best, c) => (c.citedByCount > best.citedByCount ? c : best), counts[0]);
  return (
    <div>
      <div className="flex h-10 items-end gap-[3px]" aria-hidden>
        {counts.map((c) => (
          <span
            key={c.year}
            title={`${c.year}: ${c.citedByCount}`}
            className={cn(
              "min-w-[4px] flex-1 rounded-sm transition-colors duration-300",
              EASE,
              c.year === peak.year ? "bg-mint-foreground" : "bg-mint-foreground/30",
            )}
            style={{ height: `${Math.max(6, (c.citedByCount / max) * 100)}%` }}
          />
        ))}
      </div>
      <p className="mt-2 flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
        <TrendingUpIcon className="size-3" />
        Tren sitasi · puncak {peak.year}
      </p>
    </div>
  );
}

/** DOI: teks tertaut ke doi.org + tombol salin dengan morph centang (feedback ~1,4 dtk). */
function DoiValue({ doi }: { doi: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 1400);
    return () => window.clearTimeout(id);
  }, [copied]);
  const copy = () => {
    navigator.clipboard
      ?.writeText(doi)
      .then(() => setCopied(true))
      .catch(() => {});
  };
  return (
    <div className="flex items-start gap-1.5">
      <a
        href={`https://doi.org/${doi}`}
        target="_blank"
        rel="noopener noreferrer"
        className="min-w-0 break-all text-[13px] leading-snug text-foreground underline-offset-2 hover:underline"
      >
        {doi}
      </a>
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? "DOI tersalin" : "Salin DOI"}
        className={cn(
          "mt-px flex size-5 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-[transform,color] duration-200 hover:text-foreground active:scale-90",
          EASE,
          copied && "text-mint-foreground",
        )}
      >
        {copied ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
      </button>
    </div>
  );
}

function AsideGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="py-4">
      <h3 className="mb-3 text-[11px] font-semibold tracking-tight text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

function AsideRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[4.25rem_minmax(0,1fr)] items-baseline gap-x-3">
      <dt className="text-[11px] font-medium text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-[13px] leading-snug text-foreground">{children}</dd>
    </div>
  );
}

function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const key = v.trim().toLowerCase();
    if (key && !seen.has(key)) {
      seen.add(key);
      out.push(v);
    }
  }
  return out;
}
