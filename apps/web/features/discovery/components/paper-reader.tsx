"use client";

import {
  buildExternalPaperMentionLabel,
  type ContextRef,
} from "@aqsha/chat-core";
import {
  BookOpenIcon,
  DownloadIcon,
  UserRoundIcon,
} from "@aqsha/ui/icons";
import Link from "next/link";
import { type ReactNode, useMemo } from "react";
import { SaveToWorkspaceButton } from "@/features/artifacts/components/save-to-workspace-button";
import { usePaper, useRecordInteraction } from "../api";
import { formatCitationCount } from "../format";
import type { ExplorePaper, PaperEnrichmentRef } from "../types";
import { ExploreReaderChatShell } from "./explore-reader-chat-shell";
import { GenerativeCover } from "./generative-cover";
import { PaperAside } from "./paper-aside";
import {
  AstraAgentAvatars,
  Eyebrow,
  ExpandableText,
  PillCta,
  ReaderEmpty,
  ReaderLoader,
  ReaderSection,
  ReaderShell,
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
              label: buildExternalPaperMentionLabel(paperTitle),
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
            <PillCta variant="outline" onClick={() => askAstra(paper)} bareIcon icon={<AstraAgentAvatars />}>
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

          <div className="mt-8 grid grid-cols-1 gap-x-12 gap-y-2 lg:grid-cols-[minmax(0,1fr)_18rem]">
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
                  <RelatedPaperGrid refs={paper.enriched.related} />
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

/** Grid kartu "Paper terkait" — meniru kartu standar feed Explore (cover generatif +
 * judul + meta). Ref ber-DOI dibuka di reader in-app (key `doi:`), sisanya ke OpenAlex. */
function RelatedPaperGrid({ refs }: { refs: PaperEnrichmentRef[] }) {
  return (
    <div className="grid grid-cols-2 gap-x-5 gap-y-7 sm:grid-cols-3">
      {refs.slice(0, 6).map((r) => (
        <RelatedPaperCard key={r.openalexId} paper={r} />
      ))}
    </div>
  );
}

/**
 * Tautan kartu paper terkait: internal (`/app/explore/doi:…`) bila DOI ada, jika tidak fallback ke
 * OpenAlex (tab baru). Satu wrapper → URL & atribut target/rel/a11y tak diduplikasi antara cover &
 * judul. `decorative` = pembungkus cover (disembunyikan dari a11y; judul tetap tautan utama).
 */
function PaperLink({
  internalHref,
  externalHref,
  className,
  decorative = false,
  children,
}: {
  internalHref: string | null;
  externalHref: string;
  className: string;
  decorative?: boolean;
  children: ReactNode;
}) {
  const decor = decorative ? { "aria-hidden": true, tabIndex: -1 } : {};
  return internalHref ? (
    <Link href={internalHref} className={className} {...decor}>
      {children}
    </Link>
  ) : (
    <a href={externalHref} target="_blank" rel="noopener noreferrer" className={className} {...decor}>
      {children}
    </a>
  );
}

function RelatedPaperCard({ paper }: { paper: PaperEnrichmentRef }) {
  const internalHref = paper.doi ? `/app/explore/${encodeURIComponent(`doi:${paper.doi}`)}` : null;
  const externalHref = `https://openalex.org/${paper.openalexId}`;
  const meta = [
    paper.year ? String(paper.year) : null,
    paper.citedByCount != null ? formatCitationCount(paper.citedByCount) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <article className="group flex flex-col">
      <PaperLink
        internalHref={internalHref}
        externalHref={externalHref}
        className="block overflow-hidden rounded-[12px]"
        decorative
      >
        <div className="relative aspect-[16/10] w-full transition-opacity duration-200 group-hover:opacity-90">
          <GenerativeCover title={paper.title} label="Paper" />
        </div>
      </PaperLink>

      <div className="flex min-w-0 flex-1 flex-col pt-2.5">
        <h3 className="font-heading text-[15px] font-bold leading-[1.25] tracking-tight text-foreground">
          <PaperLink
            internalHref={internalHref}
            externalHref={externalHref}
            className="line-clamp-3 break-words hover:underline underline-offset-4"
          >
            {paper.title}
          </PaperLink>
        </h3>
        {meta ? <p className="mt-2 text-[12px] font-medium text-muted-foreground">{meta}</p> : null}
      </div>
    </article>
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
