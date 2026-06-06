"use client";

import { api } from "@aqsha/convex/api";
import type { FeedConsensus, FeedItem } from "@aqsha/convex/feed";
import {
  ExternalLinkIcon,
  GaugeIcon,
  Loader2Icon,
  SparklesIcon,
} from "@aqsha/ui/icons";
import Link from "next/link";
import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { encodePaperRef } from "@/features/explore/utils/paper-ref";
import { readableConvexErrorMessage } from "@/lib/convex-error";
import { useConvexActionFn, useConvexQueryData } from "@/lib/convex-query";
import { cn } from "@/lib/utils";
import { VerdictBadge } from "./feed-visuals";

export function EvidenceDrawer({
  item,
  open,
  onOpenChange,
  onTeliti,
  busyTeliti,
}: {
  item: FeedItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTeliti: (item: FeedItem) => void;
  busyTeliti: boolean;
}) {
  const claim = item?.claim;
  const supportingKeys = claim?.supportingPaperKeys ?? [];
  const papers = useConvexQueryData(
    api.feed.papersByKeys,
    open && supportingKeys.length > 0 ? { keys: supportingKeys } : "skip",
  );

  const getConsensus = useConvexActionFn(api.feedConsensus.getConsensus);
  const [consensus, setConsensus] = useState<FeedConsensus | null>(null);
  const [consensusLoading, setConsensusLoading] = useState(false);
  const [consensusError, setConsensusError] = useState<string | null>(null);

  const handleConsensus = async () => {
    if (!item || consensusLoading) return;
    setConsensusLoading(true);
    setConsensusError(null);
    try {
      const result = await getConsensus({
        question: claim?.claim ?? item.title,
        feedItemId: item._id,
      });
      if (result.ok) {
        setConsensus(result.consensus);
      } else {
        setConsensusError(
          result.reason === "empty"
            ? "Tidak ada paper relevan untuk dinilai."
            : "Konsensus tidak bisa dihitung sekarang.",
        );
      }
    } catch (caught) {
      setConsensusError(readableConvexErrorMessage(caught, "Gagal menghitung konsensus."));
    } finally {
      setConsensusLoading(false);
    }
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setConsensus(null);
      setConsensusError(null);
    }
    onOpenChange(next);
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="right"
        className="w-full gap-0 overflow-y-auto sm:max-w-md"
      >
        <SheetHeader className="border-b border-border">
          <SheetTitle className="pr-8 text-[15px] leading-snug">Bukti & sumber</SheetTitle>
          <SheetDescription className="sr-only">
            Rincian verdict, bukti, dan paper pendukung untuk klaim ini.
          </SheetDescription>
        </SheetHeader>

        {item && claim ? (
          <div className="space-y-5 p-4">
            {/* claim + verdict */}
            <div>
              <VerdictBadge verdict={claim.verdict} className="mb-2" />
              <p className="text-[14px] font-semibold leading-snug text-foreground">
                {claim.claim}
              </p>
              {claim.verdictLabelRaw ? (
                <p className="mt-1 text-[12px] text-muted-foreground">
                  Rating asli: “{claim.verdictLabelRaw}”
                </p>
              ) : null}
            </div>

            {/* evidence */}
            {claim.evidence ? (
              <div className="rounded-[8px] border border-border bg-background/60 p-3">
                <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground/70">
                  Ringkasan pemeriksa
                </p>
                <p className="text-[13px] leading-5 text-ink-soft">{claim.evidence}</p>
              </div>
            ) : null}

            {/* provenance */}
            <dl className="space-y-1.5 text-[12.5px]">
              <ProvenanceRow label="Pemeriksa" value={claim.publisher ?? "—"} />
              <ProvenanceRow
                label="Sumber verdict"
                value={
                  claim.verdictBy === "human"
                    ? "Pemeriksa fakta manusia"
                    : "AI (perlu tinjauan)"
                }
              />
              {claim.reviewedAt ? (
                <ProvenanceRow label="Diperiksa" value={formatDate(claim.reviewedAt)} />
              ) : null}
            </dl>

            {claim.reviewUrl ? (
              <a
                href={claim.reviewUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-foreground underline-offset-2 hover:underline"
              >
                <ExternalLinkIcon className="size-3.5" /> Buka artikel pemeriksa fakta
              </a>
            ) : null}

            {/* supporting papers */}
            <div>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground/70">
                Paper akademik terkait
              </p>
              {supportingKeys.length === 0 ? (
                <p className="text-[12.5px] text-muted-foreground">
                  Belum ada paper terkait yang dikumpulkan.
                </p>
              ) : papers === undefined ? (
                <p className="text-[12.5px] text-muted-foreground">Memuat paper…</p>
              ) : papers.length === 0 ? (
                <p className="text-[12.5px] text-muted-foreground">
                  Paper terkait belum tersedia.
                </p>
              ) : (
                <ul className="space-y-2">
                  {papers.map((paper) => (
                    <li key={paper.key}>
                      <Link
                        href={`/app/explore/${encodePaperRef(paper.key)}`}
                        className="block rounded-[8px] border border-border bg-card p-2.5 transition-colors hover:bg-muted"
                      >
                        <p className="line-clamp-2 text-[12.5px] font-medium leading-snug text-foreground">
                          {paper.title}
                        </p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {[paper.year, paper.isOpenAccess ? "Akses terbuka" : null]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* consensus meter */}
            <div className="rounded-[8px] border border-border p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-foreground">
                  <GaugeIcon className="size-4" /> Konsensus ilmiah
                </p>
                {!consensus ? (
                  <button
                    type="button"
                    onClick={handleConsensus}
                    disabled={consensusLoading}
                    className="inline-flex h-7 items-center gap-1.5 rounded-[6px] border border-border px-2 text-[12px] font-medium hover:bg-muted disabled:opacity-60"
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
            </div>

            {/* teliti */}
            <button
              type="button"
              onClick={() => onTeliti(item)}
              disabled={busyTeliti}
              className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-[8px] bg-primary text-[13px] font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-60"
            >
              {busyTeliti ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                <SparklesIcon className="size-4" />
              )}
              Teliti klaim ini
            </button>
          </div>
        ) : (
          <div className="p-4 text-[13px] text-muted-foreground">
            Tidak ada bukti untuk ditampilkan.
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function ConsensusMeter({ consensus }: { consensus: FeedConsensus }) {
  const { yes, no, possibly, total, papers } = consensus;
  if (total === 0) {
    return (
      <p className="mt-2 text-[12px] text-muted-foreground">
        Belum ada paper yang menjawab langsung pertanyaan ini.
      </p>
    );
  }
  const pct = (n: number) => Math.round((n / total) * 100);
  return (
    <div className="mt-2.5">
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-mint" style={{ width: `${pct(yes)}%` }} />
        <div className="h-full bg-lemon" style={{ width: `${pct(possibly)}%` }} />
        <div className="h-full bg-destructive" style={{ width: `${pct(no)}%` }} />
      </div>
      <p className="mt-1.5 text-[11.5px] font-medium text-muted-foreground">
        <span className="text-mint-foreground">{yes} Ya</span> ·{" "}
        <span className="text-lemon-foreground">{possibly} Mungkin</span> ·{" "}
        <span className="text-destructive">{no} Tidak</span>{" "}
        <span className="text-muted-foreground/70">(dari {total} paper)</span>
      </p>
      <ul className="mt-2.5 space-y-1.5">
        {papers.slice(0, 6).map((paper) => (
          <li key={paper.key} className="flex items-start gap-2 text-[12px]">
            <StanceChip stance={paper.stance} />
            <a
              href={paper.url}
              target="_blank"
              rel="noreferrer"
              className="line-clamp-1 text-foreground underline-offset-2 hover:underline"
            >
              {paper.title}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StanceChip({ stance }: { stance: "yes" | "no" | "possibly" | "neutral" }) {
  const map = {
    yes: { label: "Ya", className: "bg-mint-soft text-mint-foreground" },
    no: { label: "Tidak", className: "bg-destructive/10 text-destructive" },
    possibly: { label: "Mungkin", className: "bg-lemon-soft text-lemon-foreground" },
    neutral: { label: "Netral", className: "bg-muted text-muted-foreground" },
  } as const;
  const s = map[stance];
  return (
    <span
      className={cn(
        "mt-0.5 inline-flex h-4 shrink-0 items-center rounded-[4px] px-1.5 text-[10px] font-semibold leading-none",
        s.className,
      )}
    >
      {s.label}
    </span>
  );
}

function ProvenanceRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium text-foreground">{value}</dd>
    </div>
  );
}

function formatDate(ms: number): string {
  try {
    return new Date(ms).toLocaleDateString("id-ID", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return "";
  }
}
