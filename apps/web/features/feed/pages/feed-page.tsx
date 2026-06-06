"use client";

import { api } from "@aqsha/convex/api";
import type { FeedItem, FeedItemKind } from "@aqsha/convex/feed";
import {
  BookmarkIcon,
  CheckCircle2Icon,
  CompassIcon,
  SparklesIcon,
} from "@aqsha/ui/icons";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { ExploreSurfaceHeader } from "@/features/explore/components/explore-surface-header";
import { WorkspaceShell } from "@/features/workspaces/components/workspace-shell";
import { useWorkspaceIndexData } from "@/features/workspaces/api/use-workspaces-data";
import { readableConvexErrorMessage } from "@/lib/convex-error";
import {
  useConvexActionFn,
  useConvexMutationFn,
  useConvexQueryData,
} from "@/lib/convex-query";
import { cn } from "@/lib/utils";
import { FeedCard, type FeedCardHandlers } from "../components/feed-card";
import { EvidenceDrawer } from "../components/evidence-drawer";
import { IdeaDialog, type IdeaSeed } from "../components/idea-dialog";
import { VERDICT_STYLE } from "../components/feed-visuals";

type FeedTab = "untuk-kamu" | "cek-fakta" | "sedang-ramai" | "celah-riset";

const TABS: Array<{ id: FeedTab; label: string }> = [
  { id: "untuk-kamu", label: "Untuk kamu" },
  { id: "cek-fakta", label: "Cek fakta" },
  { id: "sedang-ramai", label: "Sedang ramai" },
  { id: "celah-riset", label: "Celah riset" },
];

const TAB_KINDS: Record<FeedTab, FeedItemKind[] | undefined> = {
  "untuk-kamu": undefined,
  "cek-fakta": ["claim"],
  "sedang-ramai": ["topic", "news"],
  "celah-riset": ["paper", "claim", "topic", "news"],
};

export function FeedPage() {
  const { viewer, workspaces, threads, createWorkspace, removeThread } =
    useWorkspaceIndexData();
  const router = useRouter();

  const [tab, setTab] = useState<FeedTab>("untuk-kamu");
  const [lang, setLang] = useState<"id" | "en">("id");
  const [serendipity, setSerendipity] = useState(false);

  const feedArgs = useMemo(() => {
    const kinds = TAB_KINDS[tab];
    const base: { kinds?: FeedItemKind[]; serendipity?: boolean } = {};
    if (kinds) base.kinds = kinds;
    if (tab === "untuk-kamu" && serendipity) base.serendipity = true;
    return base;
  }, [tab, serendipity]);

  const feedData = useConvexQueryData(api.feed.getFeed, feedArgs);
  const savedData = useConvexQueryData(api.feed.getSavedItems, {});

  const startThread = useConvexMutationFn(api.agent.messages.startThread);
  const saveItemFn = useConvexMutationFn(api.feed.saveItem);
  const unsaveItemFn = useConvexMutationFn(api.feed.unsaveItem);
  const hideItemFn = useConvexMutationFn(api.feed.hideItem);
  const recordInteraction = useConvexMutationFn(api.feed.recordInteraction);
  const explainRelevance = useConvexActionFn(api.feedAi.explainRelevance);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedOverride, setSavedOverride] = useState<Map<string, boolean>>(new Map());
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [relevanceNotes, setRelevanceNotes] = useState<Map<string, string>>(new Map());
  const [whyLoading, setWhyLoading] = useState<Set<string>>(new Set());

  const [evidenceItem, setEvidenceItem] = useState<FeedItem | null>(null);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [ideaSeed, setIdeaSeed] = useState<IdeaSeed | null>(null);
  const [ideaOpen, setIdeaOpen] = useState(false);
  const [topicInput, setTopicInput] = useState("");

  const isLoading = feedData === undefined;
  const allItems = useMemo<FeedItem[]>(
    () => (feedData ?? []) as FeedItem[],
    [feedData],
  );
  const items = useMemo(
    () => allItems.filter((item) => !hiddenIds.has(item._id)),
    [allItems, hiddenIds],
  );
  const savedKeys = useMemo(
    () => new Set((savedData ?? []).map((row) => (row as { _id: string })._id)),
    [savedData],
  );
  const topTopics = useMemo(() => deriveTopTopics(allItems), [allItems]);

  const isSaved = (id: string) =>
    savedOverride.has(id) ? savedOverride.get(id)! : savedKeys.has(id);

  const startResearch = async (content: string, item?: FeedItem) => {
    if (busyId) return;
    setBusyId(item?._id ?? "idea");
    setError(null);
    try {
      const result = await startThread({
        content,
        agentKind: "pro",
        commandId: "deep-research",
      });
      if (item) {
        void recordInteraction({ feedItemId: item._id, kind: "research" }).catch(
          () => {},
        );
      }
      if (result?.ok && "threadId" in result && result.threadId) {
        router.push(`/app/threads/${result.threadId}`);
        return;
      }
      const rateLimited =
        !!result && !result.ok && "reason" in result && result.reason === "rate_limited";
      setError(
        rateLimited
          ? "Batas pengiriman tercapai. Coba lagi sebentar lagi."
          : "Riset tidak bisa dimulai sekarang. Coba lagi nanti.",
      );
      setBusyId(null);
    } catch (caught) {
      setError(readableConvexErrorMessage(caught, "Gagal memulai riset."));
      setBusyId(null);
    }
  };

  const handlers: FeedCardHandlers = {
    onTeliti: (item) => void startResearch(buildSeed(item), item),
    onSave: (item) => void handleSave(item),
    onHide: (item) => {
      setHiddenIds((prev) => new Set(prev).add(item._id));
      void hideItemFn({ feedItemId: item._id }).catch(() => {});
    },
    onOpenEvidence: (item) => {
      setEvidenceItem(item);
      setEvidenceOpen(true);
      void recordInteraction({ feedItemId: item._id, kind: "open_evidence" }).catch(
        () => {},
      );
    },
    onGenerateIdeas: (item) => {
      setIdeaSeed({
        title: item.title,
        context: item.tldr ?? item.summary,
        topics: item.topics,
      });
      setIdeaOpen(true);
    },
    onWhyRelevant: (item) => void handleWhyRelevant(item),
  };

  const handleSave = async (item: FeedItem) => {
    const next = !isSaved(item._id);
    setSavedOverride((prev) => new Map(prev).set(item._id, next));
    try {
      if (next) await saveItemFn({ feedItemId: item._id });
      else await unsaveItemFn({ feedItemId: item._id });
    } catch (caught) {
      // Roll back the optimistic toggle and tell the user.
      setSavedOverride((prev) => new Map(prev).set(item._id, !next));
      setError(readableConvexErrorMessage(caught, "Gagal menyimpan. Coba lagi."));
    }
  };

  const handleWhyRelevant = async (item: FeedItem) => {
    if (relevanceNotes.has(item._id) || whyLoading.has(item._id)) return;
    setWhyLoading((prev) => new Set(prev).add(item._id));
    try {
      const result = await explainRelevance({
        title: item.title,
        context: item.tldr ?? item.summary,
        topics: item.topics,
      });
      if (result.ok) {
        setRelevanceNotes((prev) => new Map(prev).set(item._id, result.reason));
      }
    } catch {
      // silent — keep the trigger available to retry
    } finally {
      setWhyLoading((prev) => {
        const next = new Set(prev);
        next.delete(item._id);
        return next;
      });
    }
  };

  const handleIdeaResearch = (questionText: string) => {
    setIdeaOpen(false);
    void startResearch(questionText);
  };

  return (
    <WorkspaceShell
      viewer={viewer}
      workspaces={workspaces}
      threads={threads}
      createWorkspace={createWorkspace}
      removeThread={removeThread}
    >
      <main className="min-h-svh bg-background text-foreground">
        <ExploreSurfaceHeader breadcrumbs={[{ label: "Feed" }]} />
        <div className="mx-auto w-full max-w-[1180px] px-5 pb-12 pt-4 sm:px-10 md:pt-6 xl:px-14">
          <header className="max-w-[680px]">
            <h1 className="text-[30px] font-semibold leading-none tracking-normal text-foreground sm:text-[34px]">
              Feed
            </h1>
            <p className="mt-4 max-w-[680px] text-[14px] font-medium leading-6 text-muted-foreground sm:text-[15px]">
              Berita sains hangat, klaim ditimbang bukti, dan celah riset —
              temukan ide untuk dikaji, lalu mulai meneliti dalam satu klik.
            </p>
          </header>

          <FeedToolbar
            tab={tab}
            onTab={setTab}
            lang={lang}
            onLang={setLang}
            serendipity={serendipity}
            onSerendipity={setSerendipity}
          />

          {error ? (
            <div className="mt-4 max-w-[760px] rounded-[7px] border border-destructive/20 bg-destructive/10 px-4 py-3 text-[13px] font-medium text-destructive">
              {error}
            </div>
          ) : null}

          {tab === "celah-riset" ? (
            <CelahRisetPrompt
              value={topicInput}
              onChange={setTopicInput}
              onSubmit={() => {
                const topic = topicInput.trim();
                if (!topic) return;
                setIdeaSeed({ title: topic });
                setIdeaOpen(true);
              }}
            />
          ) : null}

          <section className="grid gap-8 pt-6 lg:grid-cols-[minmax(0,1fr)_280px] lg:gap-10">
            <div className="min-w-0">
              {isLoading ? (
                <FeedSkeleton />
              ) : items.length === 0 ? (
                <FeedEmptyState />
              ) : (
                <>
                  <div className="[column-fill:_balance] gap-4 sm:columns-2">
                    {items.map((item) => (
                      <FeedCard
                        key={item._id}
                        item={item}
                        lang={lang}
                        saved={isSaved(item._id)}
                        busy={busyId === item._id}
                        relevanceNote={relevanceNotes.get(item._id)}
                        whyLoading={whyLoading.has(item._id)}
                        handlers={handlers}
                      />
                    ))}
                  </div>
                  <CaughtUp />
                </>
              )}
            </div>

            <FeedSidebar
              topTopics={topTopics}
              saved={(savedData ?? []) as Array<{ _id: string; title: string }>}
            />
          </section>
        </div>
      </main>

      <EvidenceDrawer
        item={evidenceItem}
        open={evidenceOpen}
        onOpenChange={setEvidenceOpen}
        onTeliti={(item) => {
          setEvidenceOpen(false);
          void startResearch(buildSeed(item), item);
        }}
        busyTeliti={busyId === evidenceItem?._id}
      />

      <IdeaDialog
        seed={ideaSeed}
        open={ideaOpen}
        onOpenChange={setIdeaOpen}
        onStartResearch={handleIdeaResearch}
        busy={busyId === "idea"}
      />
    </WorkspaceShell>
  );
}

function FeedToolbar({
  tab,
  onTab,
  lang,
  onLang,
  serendipity,
  onSerendipity,
}: {
  tab: FeedTab;
  onTab: (tab: FeedTab) => void;
  lang: "id" | "en";
  onLang: (lang: "id" | "en") => void;
  serendipity: boolean;
  onSerendipity: (value: boolean) => void;
}) {
  return (
    <div className="mt-6 flex flex-wrap items-center gap-2 border-b border-border pb-3">
      <div className="flex flex-wrap items-center gap-1">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => onTab(entry.id)}
            className={cn(
              "h-8 rounded-[7px] px-3 text-[13px] font-semibold transition-colors",
              tab === entry.id
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {entry.label}
          </button>
        ))}
      </div>

      <div className="ml-auto flex items-center gap-2">
        {tab === "untuk-kamu" ? (
          <button
            type="button"
            onClick={() => onSerendipity(!serendipity)}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-[7px] border px-2.5 text-[12.5px] font-medium transition-colors",
              serendipity
                ? "border-lavender-soft-border bg-lavender-soft text-lavender-foreground"
                : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
            title="Tampilkan bidang bersebelahan (anti filter bubble)"
          >
            <CompassIcon className="size-3.5" /> Serendipity
          </button>
        ) : null}
        <div className="inline-flex h-8 items-center rounded-[7px] border border-border p-0.5">
          {(["id", "en"] as const).map((code) => (
            <button
              key={code}
              type="button"
              onClick={() => onLang(code)}
              className={cn(
                "h-7 rounded-[5px] px-2 text-[12px] font-semibold uppercase transition-colors",
                lang === code
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {code}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function CelahRisetPrompt({
  value,
  onChange,
  onSubmit,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <div className="mt-5 rounded-[12px] border border-mint-soft-border bg-mint-soft/50 p-4">
      <p className="flex items-center gap-1.5 text-[13.5px] font-semibold text-foreground">
        <CompassIcon className="size-4" /> Buntu ide? Mulai dari sebuah topik
      </p>
      <p className="mt-1 text-[12.5px] text-muted-foreground">
        Tulis topik apa pun — Aqsha menambang celah riset & menyusun pertanyaan
        yang layak diteliti.
      </p>
      <form
        className="mt-3 flex flex-col gap-2 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="mis. dampak mikroplastik pada air minum di Indonesia"
          className="h-9 flex-1 rounded-[8px] border border-border bg-background px-3 text-[13px] text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <button
          type="submit"
          disabled={!value.trim()}
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-[8px] bg-primary px-4 text-[13px] font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-50"
        >
          <SparklesIcon className="size-4" /> Hasilkan pertanyaan
        </button>
      </form>
    </div>
  );
}

function FeedSidebar({
  topTopics,
  saved,
}: {
  topTopics: Array<{ name: string; count: number }>;
  saved: Array<{ _id: string; title: string }>;
}) {
  return (
    <aside className="hidden space-y-8 pt-1 lg:block">
      {topTopics.length > 0 ? (
        <div>
          <h2 className="mb-4 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground/70">
            Sedang ramai
          </h2>
          <ol className="space-y-3.5">
            {topTopics.map((topic) => (
              <li
                key={topic.name}
                className="flex items-center justify-between gap-5 text-[13px] font-medium"
              >
                <span className="truncate text-muted-foreground">{topic.name}</span>
                <span className="font-mono text-[11px] text-muted-foreground/80">
                  {topic.count}
                </span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      <div>
        <h2 className="mb-4 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground/70">
          <BookmarkIcon className="size-3" /> Tersimpan
        </h2>
        {saved.length === 0 ? (
          <p className="text-[12.5px] leading-5 text-muted-foreground">
            Simpan item untuk membangun koleksi ide & mempertajam relevansi feed.
          </p>
        ) : (
          <ul className="space-y-3">
            {saved.slice(0, 6).map((row) => (
              <li
                key={row._id}
                className="line-clamp-2 text-[12.5px] font-medium leading-snug text-muted-foreground"
              >
                {row.title}
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}

function CaughtUp() {
  return (
    <div className="mt-8 flex flex-col items-center gap-2 border-t border-border/60 py-10 text-center">
      <div className="flex size-9 items-center justify-center rounded-full bg-mint-soft text-mint-foreground">
        <CheckCircle2Icon className="size-5" />
      </div>
      <p className="text-[14px] font-semibold text-foreground">Kamu sudah update</p>
      <p className="max-w-[320px] text-[12.5px] text-muted-foreground">
        Itu semua untuk sekarang. Feed disegarkan berkala — kembali lagi nanti
        atau simpan beberapa item untuk diteliti.
      </p>
    </div>
  );
}

function FeedEmptyState() {
  return (
    <div className="mt-2 max-w-[560px] rounded-[10px] border border-border bg-card px-5 py-8 text-center">
      <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-full bg-mint-soft text-mint-foreground">
        <SparklesIcon className="size-5" />
      </div>
      <h3 className="text-[15px] font-semibold text-foreground">Belum ada item</h3>
      <p className="mx-auto mt-1.5 max-w-[380px] text-[13px] font-medium leading-5 text-muted-foreground">
        Konten untuk lajur ini akan muncul setelah penyegaran terjadwal
        berikutnya.
      </p>
    </div>
  );
}

function FeedSkeleton() {
  return (
    <div className="gap-4 sm:columns-2">
      {Array.from({ length: 6 }).map((_, index) => (
        <div
          key={index}
          className="mb-4 break-inside-avoid rounded-[12px] border border-border bg-card p-4"
        >
          <Skeleton className="mb-2 h-3 w-1/3" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="mt-2 h-3 w-1/2" />
          <Skeleton className="mt-3 h-12 w-full" />
          <Skeleton className="mt-3 h-8 w-28 rounded-[7px]" />
        </div>
      ))}
    </div>
  );
}

function buildSeed(item: FeedItem): string {
  if (item.kind === "claim" && item.claim) {
    const verdict = VERDICT_STYLE[item.claim.verdict].label;
    const lines = [
      `Klaim viral: ${item.claim.claim}`,
      `Verdict pemeriksa fakta: ${verdict}${item.claim.publisher ? ` (${item.claim.publisher})` : ""}`,
      "",
      "Telaah bukti ilmiah di balik klaim ini: apa yang dikatakan literatur, seberapa kuat buktinya, dan konteks apa yang penting.",
      item.claim.reviewUrl ? `Sumber pemeriksa: ${item.claim.reviewUrl}` : "",
    ];
    return lines.filter(Boolean).join("\n");
  }
  return `${item.title}\n\n${item.tldr ?? item.summary}\n\nSumber: ${item.url}`;
}

function deriveTopTopics(items: FeedItem[]) {
  const counts = new Map<string, number>();
  for (const item of items) {
    for (const topic of item.topics) {
      const name = topic.trim();
      if (!name) continue;
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, count]) => ({ name, count }));
}
