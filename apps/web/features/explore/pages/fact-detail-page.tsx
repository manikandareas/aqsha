"use client";

import { api } from "@aqsha/convex/api";
import type { FeedConsensus, FeedItem } from "@aqsha/convex/feed";
import {
  ClockIcon,
  GaugeIcon,
  Loader2Icon,
} from "@aqsha/ui/icons";
import Link from "next/link";
import { useState } from "react";
import { ConsensusMeter } from "@/features/explore/components/consensus-meter";
import { VERDICT_STYLE } from "@/features/discovery/utils/discovery-verdict-style";
import { VerdictBadge } from "@/features/discovery/components/discovery-visuals";
import { encodePaperRef } from "@/features/explore/utils/paper-ref";
import { readableConvexErrorMessage } from "@/lib/convex-error";
import {
  useConvexActionFn,
  useConvexQueryData,
} from "@/lib/convex-query";
import { ReaderActions } from "../components/reader-actions";
import {
  ReaderArticleBody,
  ReaderHeroMedia,
  ReaderRelatedGrid,
  ReaderSourceCard,
} from "../components/reader-bits";
import { formatAbsoluteDate, relativeTime } from "../utils/reader-format";
import { ReaderDetailShell } from "./reader-detail-shell";
import { ReaderDetailLoading } from "./reader-detail-loading";
import { ReaderDetailState } from "./reader-detail-state";

type FactClaim = NonNullable<FeedItem["claim"]>;

function buildFactSeed(claim: FactClaim) {
  const verdict = VERDICT_STYLE[claim.verdict].label;
  return [
    `Klaim viral: ${claim.claim}`,
    `Verdict pemeriksa fakta: ${verdict}${claim.publisher ? ` (${claim.publisher})` : ""}`,
    "",
    "Telaah bukti ilmiah di balik klaim ini: apa yang dikatakan literatur, seberapa kuat buktinya, dan konteks apa yang penting.",
    claim.reviewUrl ? `Sumber pemeriksa: ${claim.reviewUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function FactDetailPage({ feedItemId }: { feedItemId: string }) {
  const data = useConvexQueryData(
    api.feed.getFeedItem,
    feedItemId ? { feedItemId } : "skip",
  );
  const chatSeed =
    data && data.kind === "claim" && data.claim
      ? buildFactSeed(data.claim)
      : undefined;

  return (
    <ReaderDetailShell breadcrumbLabel="Cek fakta" chatSeed={chatSeed}>
      {data === undefined ? (
        <ReaderDetailLoading />
      ) : !data || data.kind !== "claim" || !data.claim ? (
        <ReaderDetailState
          title="Cek fakta tidak tersedia."
          message="Item ini tidak ditemukan atau bukan klaim. Coba kembali ke Jelajahi."
        />
      ) : (
        <FactDetailContent item={data as FeedItem} claim={data.claim} />
      )}
    </ReaderDetailShell>
  );
}

function FactDetailContent({
  item,
  claim,
}: {
  item: FeedItem;
  claim: FactClaim;
}) {
  const time = relativeTime(item.publishedAt, "id");
  const reviewedDate = claim.reviewedAt
    ? formatAbsoluteDate(claim.reviewedAt, "id")
    : null;
  const claimDateText = claim.claimDate
    ? formatAbsoluteDate(claim.claimDate, "id")
    : null;
  // The ClaimReview `claimant` is sometimes just the reviewer/publisher; only
  // surface it when it names a genuinely different origin.
  const claimant =
    claim.claimant &&
    claim.claimant.trim().toLowerCase() !==
      (claim.publisher ?? "").trim().toLowerCase()
      ? claim.claimant
      : null;
  const supportingKeys = claim.supportingPaperKeys ?? [];
  const sourceUrl = claim.reviewUrl ?? item.url;

  const papers = useConvexQueryData(
    api.feed.papersByKeys,
    supportingKeys.length > 0 ? { keys: supportingKeys } : "skip",
  );
  const related = useConvexQueryData(api.feed.getRelatedFeedItems, {
    feedItemId: item._id,
    limit: 8,
  });

  const getConsensus = useConvexActionFn(api.feed.consensus.getConsensus);
  const [consensus, setConsensus] = useState<FeedConsensus | null>(null);
  const [consensusLoading, setConsensusLoading] = useState(false);
  const [consensusError, setConsensusError] = useState<string | null>(null);

  const handleConsensus = async () => {
    if (consensusLoading) return;
    setConsensusLoading(true);
    setConsensusError(null);
    try {
      const result = await getConsensus({
        question: claim.claim,
        feedItemId: item._id,
      });
      if (result.ok) {
        setConsensus(result.consensus);
        setConsensusLoading(false);
      } else {
        setConsensusError(
          result.reason === "empty"
            ? "Tidak ada paper relevan untuk dinilai."
            : "Konsensus tidak bisa dihitung sekarang.",
        );
        setConsensusLoading(false);
      }
    } catch (caught) {
      setConsensusError(
        readableConvexErrorMessage(caught, "Gagal menghitung konsensus."),
      );
      setConsensusLoading(false);
    }
  };

  const researchSeed = buildFactSeed(claim);

  return (
    <article className="min-w-0">
      <VerdictBadge verdict={claim.verdict} className="mb-3" />

      <h1 className="font-heading text-[26px] font-bold leading-[1.14] tracking-tight text-foreground sm:text-[34px]">
        {claim.claim}
      </h1>

      <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] font-medium text-muted-foreground">
        {claim.publisher ? <span>Diperiksa {claim.publisher}</span> : null}
        {claim.verdictLabelRaw ? (
          <span>· Rating asli: “{claim.verdictLabelRaw}”</span>
        ) : null}
        {reviewedDate ? <span>· Ditinjau {reviewedDate}</span> : null}
        {time ? (
          <span className="inline-flex items-center gap-1">
            <ClockIcon className="size-3" /> {time}
          </span>
        ) : null}
      </div>

      {claimant || claimDateText ? (
        <p className="mt-1.5 text-[12.5px] font-medium text-muted-foreground">
          {claimant ? `Diklaim oleh ${claimant}` : "Klaim beredar"}
          {claimDateText ? ` · ${claimDateText}` : ""}
        </p>
      ) : null}

      <div className="mt-4">
        <ReaderSourceCard
          url={sourceUrl}
          label={claim.publisher ?? item.sourceLabel}
          ctaLabel="Buka artikel"
        />
      </div>

      <ReaderHeroMedia imageUrl={item.imageUrl} title={claim.claim} className="mt-6" />

      {item.articleText ? (
        <section className="mt-8">
          <h2 className="mb-3 text-[15px] font-semibold text-foreground">
            Penjelasan pemeriksa fakta
          </h2>
          {claim.evidence && claim.evidence !== claim.claim ? (
            <p className="mb-4 text-[15px] font-medium leading-7 text-foreground">
              {claim.evidence}
            </p>
          ) : null}
          <ReaderArticleBody text={item.articleText} />
          {claim.reviewUrl ? (
            <p className="mt-4 text-[12.5px] text-muted-foreground">
              Sumber:{" "}
              <a
                href={claim.reviewUrl}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-foreground underline-offset-2 hover:underline"
              >
                {claim.publisher ?? item.sourceLabel}
              </a>
            </p>
          ) : null}
        </section>
      ) : claim.evidence ? (
        <section className="mt-7 rounded-[12px] border border-border bg-card/60 p-4">
          <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground/70">
            Ringkasan pemeriksa
          </p>
          <p className="text-[14px] leading-6 text-ink-soft">{claim.evidence}</p>
          {claim.reviewUrl ? (
            <a
              href={claim.reviewUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex text-[12.5px] font-medium text-foreground underline-offset-2 hover:underline"
            >
              Baca pemeriksaan lengkap →
            </a>
          ) : null}
        </section>
      ) : null}

      {/* supporting academic papers */}
      <section className="mt-8">
        <h2 className="mb-3 text-[15px] font-semibold text-foreground">
          Paper akademik terkait
        </h2>
        {supportingKeys.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">
            Belum ada paper terkait yang dikumpulkan.
          </p>
        ) : papers === undefined ? (
          <p className="text-[13px] text-muted-foreground">Memuat paper…</p>
        ) : papers.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">
            Paper terkait belum tersedia.
          </p>
        ) : (
          <ul className="space-y-2">
            {papers.map((paper) => (
              <li key={paper.key}>
                <Link
                  href={`/app/explore/${encodePaperRef(paper.key)}`}
                  className="block rounded-[10px] border border-border bg-card p-3 transition-colors hover:bg-muted"
                >
                  <p className="line-clamp-2 text-[13px] font-medium leading-snug text-foreground">
                    {paper.title}
                  </p>
                  <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                    {[paper.year, paper.isOpenAccess ? "Akses terbuka" : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* scientific consensus */}
      <section className="mt-8 rounded-[12px] border border-border p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-foreground">
            <GaugeIcon className="size-4" /> Konsensus ilmiah
          </p>
          {!consensus ? (
            <button
              type="button"
              onClick={() => void handleConsensus()}
              disabled={consensusLoading}
              className="inline-flex h-7 items-center gap-1.5 rounded-[7px] border border-border px-2.5 text-[12px] font-medium transition-colors hover:bg-muted disabled:opacity-60"
            >
              {consensusLoading ? (
                <Loader2Icon className="size-3.5 animate-spin" />
              ) : null}
              Hitung
            </button>
          ) : null}
        </div>
        {consensusError ? (
          <p className="mt-2 text-[12px] text-destructive">{consensusError}</p>
        ) : null}
        {consensus ? <ConsensusMeter consensus={consensus} /> : null}
      </section>

      <ReaderActions
        item={item}
        askLabel="Tanya Astra"
        researchSeed={researchSeed}
      />

      <ReaderRelatedGrid items={(related ?? []) as FeedItem[]} />
    </article>
  );
}
