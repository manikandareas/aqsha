"use client";

import {
  buildExternalPaperMentionLabel,
  type ContextRef,
} from "@aqsha/chat-core";
import { Badge } from "@aqsha/ui/components/badge";
import {
  BookOpenIcon,
  DownloadIcon,
  Link2Icon,
  SparklesIcon,
  UserRoundIcon,
} from "@aqsha/ui/icons";
import { useMemo, type ReactNode } from "react";
import { SaveToWorkspaceButton } from "@/features/artifacts/components/save-to-workspace-button";
import { usePaper, useRecordInteraction } from "../api";
import { formatCitationCount } from "../format";
import type { ExplorePaper, PaperEnrichment, PaperEnrichmentRef } from "../types";
import { clampDiscoveryTitle } from "../ask-astra";
import { ExploreReaderChatShell } from "./explore-reader-chat-shell";
import {
  Eyebrow,
  ExpandableText,
  MetaItem,
  PillCta,
  ReaderEmpty,
  ReaderLoader,
  ReaderSection,
  ReaderShell,
  StatCell,
} from "./reader-ui";

/** Halaman baca paper + panel chat Astra; menyematkan paper sebagai token konteks otomatis. */
export function PaperReaderRoute({ paperKey }: { paperKey: string }) {
  const paper = usePaper(paperKey).data;
  const paperTitle = paper?.title;
  const ambientContextRefs = useMemo<ContextRef[]>(
    () =>
      paperTitle
        ? [
            {
              kind: "explore-paper",
              paperKey,
              label: buildExternalPaperMentionLabel(clampDiscoveryTitle(paperTitle)),
            },
          ]
        : [],
    [paperKey, paperTitle],
  );
  return (
    <ExploreReaderChatShell breadcrumb="Paper" ambientContextRefs={ambientContextRefs}>
      {({ openChat }) => <PaperReader paperKey={paperKey} onAskAstra={openChat} />}
    </ExploreReaderChatShell>
  );
}

/** Reader paper: getPaperDetail(key) → header + aksi + metrik + abstrak + referensi + fact-sheet.
 * `onAskAstra` (disediakan shell halaman) membuka panel chat. */
export function PaperReader({
  paperKey,
  onAskAstra,
}: {
  paperKey: string;
  onAskAstra: () => void;
}) {
  const query = usePaper(paperKey);
  const record = useRecordInteraction();
  const paper = query.data;

  const askAstra = (p: ExplorePaper) => {
    record.mutate({ itemRef: { kind: "paper", paperKey: p.key }, kind: "research" });
    onAskAstra();
  };

  return (
    <ReaderShell width="wide">
      {query.isPending ? (
        <ReaderLoader />
      ) : !paper ? (
        <ReaderEmpty
          title="Paper ini belum bisa ditampilkan"
          message="Kami belum berhasil menarik detailnya. Coba buka sumber aslinya, atau kembali ke Jelajahi."
        />
      ) : (
        <article className="mt-7">
          <PaperHeader paper={paper} />

          <div className="mt-6 flex flex-wrap items-center gap-2.5">
            {paper.pdfUrl ?? paper.enriched?.oaUrl ? (
              <PillCta href={paper.pdfUrl ?? paper.enriched?.oaUrl} icon={<DownloadIcon className="size-4" />}>
                Unduh PDF
              </PillCta>
            ) : null}
            <PillCta href={paper.url} variant={paper.pdfUrl ?? paper.enriched?.oaUrl ? "outline" : "solid"}>
              Lihat di penerbit
            </PillCta>
            <PillCta variant="outline" onClick={() => askAstra(paper)} icon={<SparklesIcon className="size-4" />}>
              Tanya Astra
            </PillCta>
            <SaveToWorkspaceButton
              url={paper.url}
              title={paper.title}
              label="Simpan"
              size="sm"
              variant="ghost"
              className="rounded-full text-muted-foreground hover:text-foreground"
              onSaved={() => record.mutate({ itemRef: { kind: "paper", paperKey: paper.key }, kind: "save" })}
            />
          </div>

          {paper.enriched ? <MetricStrip enriched={paper.enriched} citedByCount={paper.citedByCount} /> : null}

          <div className="mt-2 grid grid-cols-1 gap-x-12 gap-y-2 lg:grid-cols-[minmax(0,1fr)_18rem]">
            <div className="min-w-0">
              {paper.abstract || paper.snippet ? (
                <ReaderSection title="Abstrak">
                  <ExpandableText text={paper.abstract ?? paper.snippet ?? ""} clampLines={10} />
                </ReaderSection>
              ) : null}

              {paper.enriched && paper.enriched.references.length > 0 ? (
                <ReaderSection title="Referensi" count={paper.enriched.referencedCount || undefined}>
                  <RefList refs={paper.enriched.references} />
                </ReaderSection>
              ) : null}

              {paper.enriched && paper.enriched.citedBy.length > 0 ? (
                <ReaderSection title="Dikutip oleh">
                  <RefList refs={paper.enriched.citedBy} />
                </ReaderSection>
              ) : null}

              {paper.enriched && paper.enriched.related.length > 0 ? (
                <ReaderSection title="Paper terkait">
                  <RefList refs={paper.enriched.related} />
                </ReaderSection>
              ) : null}
            </div>

            <PaperAside paper={paper} />
          </div>
        </article>
      )}
    </ReaderShell>
  );
}

function PaperHeader({ paper }: { paper: ExplorePaper }) {
  const meta = [paper.enriched?.journal ?? paper.venue, paper.year ? String(paper.year) : null]
    .filter(Boolean)
    .join(" · ");
  return (
    <header className="max-w-3xl">
      <div className="flex flex-wrap items-center gap-2">
        <Eyebrow tone="mint" icon={<BookOpenIcon className="size-3" />}>
          Paper · {paper.provider}
        </Eyebrow>
        {paper.isOpenAccess ? <Eyebrow tone="lemon">Akses terbuka</Eyebrow> : null}
      </div>
      <h1 className="mt-4 font-serif text-[28px] leading-[1.12] tracking-tight text-foreground sm:text-[40px]">
        {paper.title}
      </h1>
      {paper.authors.length > 0 ? (
        <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
          <UserRoundIcon className="size-3.5 shrink-0" />
          <span className="line-clamp-2">{paper.authors.join(", ")}</span>
        </p>
      ) : null}
      {meta ? <p className="mt-1 text-sm text-muted-foreground">{meta}</p> : null}
    </header>
  );
}

// ── Metric strip (sitasi · persentil · FWCI · referensi) + sparkline tren ───
function MetricStrip({ enriched, citedByCount }: { enriched: PaperEnrichment; citedByCount?: number }) {
  const cites = citedByCount ?? enriched.citedByCount;
  const metrics: Array<{ label: string; value: string }> = [];
  if (cites != null) metrics.push({ label: "Sitasi", value: cites.toLocaleString("id-ID") });
  if (enriched.citationPercentile != null)
    metrics.push({ label: "Persentil sitasi", value: `${enriched.citationPercentile}` });
  if (enriched.fwci != null)
    metrics.push({
      label: "FWCI",
      value: enriched.fwci.toLocaleString("id-ID", { maximumFractionDigits: 2 }),
    });
  if (enriched.referencedCount > 0)
    metrics.push({ label: "Referensi", value: String(enriched.referencedCount) });

  if (metrics.length === 0 && enriched.countsByYear.length < 2) return null;

  return (
    <div className="mt-7 rounded-2xl border border-border/60 bg-muted/25 px-5 py-4">
      <div className="flex flex-wrap items-end gap-x-9 gap-y-4">
        {metrics.map((m) => (
          <StatCell key={m.label} value={m.value} label={m.label} />
        ))}
        {enriched.countsByYear.length > 1 ? (
          <div className="min-w-0">
            <CitationSparkline counts={enriched.countsByYear} />
            <p className="mt-1.5 text-[11px] font-medium text-muted-foreground">Tren sitasi</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function CitationSparkline({ counts }: { counts: PaperEnrichment["countsByYear"] }) {
  const max = Math.max(1, ...counts.map((c) => c.citedByCount));
  return (
    <div className="flex h-8 items-end gap-[3px]" aria-hidden>
      {counts.map((c) => (
        <span
          key={c.year}
          title={`${c.year}: ${c.citedByCount}`}
          className="w-[6px] rounded-sm bg-mint-foreground/65"
          style={{ height: `${Math.max(8, (c.citedByCount / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}

// ── Fact-sheet aside (sticky di desktop) ────────────────────────────────────
function PaperAside({ paper }: { paper: ExplorePaper }) {
  const e = paper.enriched;
  const facts: Array<{ label: string; node: ReactNode }> = [];
  const journal = e?.journal ?? paper.venue;
  if (journal) facts.push({ label: "Jurnal", node: journal });
  if (paper.doi)
    facts.push({
      label: "DOI",
      node: (
        <a
          href={`https://doi.org/${paper.doi}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 break-all text-foreground hover:underline underline-offset-2"
        >
          <Link2Icon className="size-3 shrink-0 text-muted-foreground" />
          {paper.doi}
        </a>
      ),
    });
  if (e?.oaStatus) facts.push({ label: "Akses", node: e.oaStatus });
  if (e?.issn && e.issn.length > 0) facts.push({ label: "ISSN", node: e.issn[0] });
  if (e?.license) facts.push({ label: "Lisensi", node: e.license });
  if (e?.language) facts.push({ label: "Bahasa", node: e.language.toUpperCase() });

  const concepts = [...(e?.concepts.map((c) => c.name) ?? []), ...paper.topics];
  const hasAside =
    facts.length > 0 ||
    concepts.length > 0 ||
    (e?.institutions.length ?? 0) > 0 ||
    (e?.sdgs.length ?? 0) > 0 ||
    (e?.funders.length ?? 0) > 0;
  if (!hasAside) return null;

  return (
    <aside className="mt-9 min-w-0 lg:sticky lg:top-6 lg:mt-9 lg:self-start">
      <div className="space-y-6 rounded-2xl border border-border/60 bg-card px-5 py-5">
        {facts.length > 0 ? (
          <div>
            <h3 className="mb-3 font-serif text-base text-foreground">Tentang paper</h3>
            <dl className="space-y-3">
              {facts.map((f) => (
                <MetaItem key={f.label} label={f.label}>
                  {f.node}
                </MetaItem>
              ))}
            </dl>
          </div>
        ) : null}

        {e && e.institutions.length > 0 ? (
          <AsideBlock title="Afiliasi">
            <p className="text-[13px] leading-relaxed text-muted-foreground">{e.institutions.join(" · ")}</p>
          </AsideBlock>
        ) : null}

        {concepts.length > 0 ? (
          <AsideBlock title="Topik & konsep">
            <div className="flex flex-wrap gap-1.5">
              {dedupe(concepts).slice(0, 10).map((c) => (
                <Badge key={c} variant="secondary" className="font-normal">
                  {c}
                </Badge>
              ))}
            </div>
          </AsideBlock>
        ) : null}

        {e && e.sdgs.length > 0 ? (
          <AsideBlock title="Tujuan pembangunan berkelanjutan">
            <div className="flex flex-wrap gap-1.5">
              {e.sdgs.map((s) => (
                <Badge key={s.name} variant="outline" className="font-normal">
                  {s.name}
                </Badge>
              ))}
            </div>
          </AsideBlock>
        ) : null}

        {e && e.funders.length > 0 ? (
          <AsideBlock title="Pendanaan">
            <p className="text-[13px] leading-relaxed text-muted-foreground">{e.funders.join(" · ")}</p>
          </AsideBlock>
        ) : null}
      </div>
    </aside>
  );
}

function AsideBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border-t border-border/60 pt-5 first:border-t-0 first:pt-0">
      <h3 className="mb-2.5 text-[11px] font-semibold tracking-tight text-muted-foreground">{title}</h3>
      {children}
    </div>
  );
}

function RefList({ refs }: { refs: PaperEnrichmentRef[] }) {
  return (
    <ul className="divide-y divide-border/50 overflow-hidden rounded-2xl border border-border/60">
      {refs.map((r) => {
        const href = r.doi ? `https://doi.org/${r.doi}` : `https://openalex.org/${r.openalexId}`;
        return (
          <li key={r.openalexId}>
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex flex-col gap-1 px-4 py-3 transition-colors duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-muted/40"
            >
              <span className="text-sm leading-snug text-foreground group-hover:underline underline-offset-2">
                {r.title}
              </span>
              <span className="text-[12px] text-muted-foreground">
                {[r.year ? String(r.year) : null, r.citedByCount != null ? formatCitationCount(r.citedByCount) : null]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </a>
          </li>
        );
      })}
    </ul>
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
