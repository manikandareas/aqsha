"use client";

import { api } from "@aqsha/convex/api";
import type { FeedIdeaQuestion } from "@aqsha/convex/feed";
import { CompassIcon, Loader2Icon, SparklesIcon } from "@aqsha/ui/icons";
import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { readableConvexErrorMessage } from "@/lib/convex-error";
import { useConvexActionFn } from "@/lib/convex-query";
import { ScoreBar } from "./feed-visuals";

export type IdeaSeed = {
  title: string;
  context?: string;
  topics?: string[];
};

const GAP_LABEL: Record<string, string> = {
  geografis: "Celah geografis",
  temporal: "Celah temporal",
  populasi: "Celah populasi",
  metodologis: "Celah metodologis",
  integrasi: "Celah integrasi",
  konteks: "Celah konteks",
};

export function IdeaDialog({
  seed,
  open,
  onOpenChange,
  onStartResearch,
  busy,
}: {
  seed: IdeaSeed | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStartResearch: (questionText: string) => void;
  busy: boolean;
}) {
  const generateIdeas = useConvexActionFn(api.feedIdeas.generateIdeas);
  const [questions, setQuestions] = useState<FeedIdeaQuestion[] | null>(null);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generatedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!open || !seed) return;
    if (generatedFor.current === seed.title) return;
    generatedFor.current = seed.title;
    setQuestions(null);
    setDrafts({});
    setError(null);
    setLoading(true);
    let active = true;
    void (async () => {
      try {
        const result = await generateIdeas({
          title: seed.title,
          context: seed.context,
          topics: seed.topics,
        });
        if (!active) return;
        if (result.ok) {
          setQuestions(result.questions);
          setDrafts(
            Object.fromEntries(result.questions.map((q, i) => [i, q.question])),
          );
        } else {
          setError(reasonMessage(result.reason));
        }
      } catch (caught) {
        if (active) {
          setError(readableConvexErrorMessage(caught, "Gagal menghasilkan ide."));
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [open, seed, generateIdeas]);

  const handleOpenChange = (next: boolean) => {
    if (!next) generatedFor.current = null;
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[16px]">
            <CompassIcon className="size-4" /> Celah & pertanyaan riset
          </DialogTitle>
          <DialogDescription>
            {seed
              ? `Dari: ${truncate(seed.title, 110)}`
              : "Pilih item untuk menghasilkan ide riset."}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-[13px] text-muted-foreground">
            <Loader2Icon className="size-4 animate-spin" /> Menambang celah riset…
          </div>
        ) : error ? (
          <div className="rounded-[8px] border border-destructive/20 bg-destructive/10 px-4 py-3 text-[13px] font-medium text-destructive">
            {error}
          </div>
        ) : questions && questions.length > 0 ? (
          <div className="space-y-3">
            {questions.map((q, index) => (
              <div
                key={index}
                className="rounded-[10px] border border-border bg-card p-3.5"
              >
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  {q.gapType ? (
                    <span className="inline-flex h-5 items-center rounded-[4px] bg-lavender-soft px-2 text-[10.5px] font-semibold leading-none text-lavender-foreground">
                      {GAP_LABEL[q.gapType] ?? q.gapType}
                    </span>
                  ) : null}
                </div>

                <textarea
                  value={drafts[index] ?? q.question}
                  onChange={(event) =>
                    setDrafts((prev) => ({ ...prev, [index]: event.target.value }))
                  }
                  rows={2}
                  className="w-full resize-none rounded-[8px] border border-border bg-background px-3 py-2 text-[13.5px] font-medium leading-snug text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />

                <div className="mt-2.5 flex items-center gap-4">
                  <ScoreBar label="Kebaruan" value={q.noveltyScore} tone="sky" />
                  <ScoreBar label="Kelayakan" value={q.feasibilityScore} tone="mint" />
                </div>

                <dl className="mt-2.5 space-y-1 text-[12px] leading-5">
                  <div>
                    <dt className="inline font-semibold text-foreground">Metode: </dt>
                    <dd className="inline text-ink-soft">{q.methodology}</dd>
                  </div>
                  <div>
                    <dt className="inline font-semibold text-foreground">Kenapa: </dt>
                    <dd className="inline text-ink-soft">{q.rationale}</dd>
                  </div>
                  {q.finerNote ? (
                    <div>
                      <dt className="inline font-semibold text-coral-foreground">
                        FINER:{" "}
                      </dt>
                      <dd className="inline text-ink-soft">{q.finerNote}</dd>
                    </div>
                  ) : null}
                </dl>

                <button
                  type="button"
                  onClick={() => onStartResearch(drafts[index] ?? q.question)}
                  disabled={busy}
                  className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-[7px] bg-primary px-3 text-[12.5px] font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-60"
                >
                  {busy ? (
                    <Loader2Icon className="size-3.5 animate-spin" />
                  ) : (
                    <SparklesIcon className="size-3.5" />
                  )}
                  Teliti pertanyaan ini
                </button>
              </div>
            ))}
            <p className="px-1 text-[11px] text-muted-foreground">
              Skor dihasilkan AI sebagai panduan kasar, bukan penilaian final.
              Sunting pertanyaan sebelum meneliti bila perlu.
            </p>
          </div>
        ) : (
          <div className="py-10 text-center text-[13px] text-muted-foreground">
            Belum ada pertanyaan yang dihasilkan.
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function reasonMessage(reason: string): string {
  switch (reason) {
    case "quota_exceeded":
      return "Kuota kredit habis. Coba lagi setelah kuota diperbarui.";
    case "subscription_required":
      return "Fitur ini butuh paket berlangganan.";
    case "billing_inactive":
      return "Status langganan tidak aktif.";
    case "empty":
      return "Tidak ada konteks untuk menghasilkan ide.";
    default:
      return "Tidak bisa menghasilkan ide sekarang.";
  }
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}
