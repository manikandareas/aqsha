import type { EvidenceCards } from "../../agents/subagents/schemas";

export type MemoryScope = {
  ownerUserId: string;
  chatThreadId?: string | null;
  runId?: string | null;
};

export type ImportantNumber = {
  value: string;
  unit: string | null;
};

export type EvidenceCardInsert = {
  ownerUserId: string;
  chatThreadId: string | null;
  runId: string | null;
  chatSourceId: string | null;
  sourceUrl: string;
  sourceTitle: string | null;
  claimText: string;
  quote: string | null;
  importantNumbers: ImportantNumber[];
  confidence: "high" | "medium" | "low";
  tier: "A" | "B" | "C" | "D";
  qualityScore: number;
  provider:
    | "exa"
    | "arxiv"
    | "crossref"
    | "pubmed"
    | "direct"
    | "memory"
    | null;
  notes: string | null;
};

export type EvidenceCardEmbeddedInsert = EvidenceCardInsert & {
  embedding: number[];
};

export type RecallMatch = {
  cardId: string;
  sourceUrl: string;
  sourceTitle: string | null;
  claimText: string;
  quote: string | null;
  tier: "A" | "B" | "C" | "D";
  qualityScore: number;
  provider: string | null;
  similarity: number;
  firstSeenAt: string;
};

export type StoreCardsInput = {
  cards: EvidenceCards;
  scope: MemoryScope;
};

export type CachedSource = {
  url: string;
  title: string | null;
  text: string;
  fetchedAt: string;
};

export type SourceUpsertInput = {
  ownerUserId: string;
  urlHash: string;
  sourceUrl: string;
  title: string | null;
  mimeType: string | null;
  pageCount: number | null;
};

export type ChunkInsert = {
  text: string;
  embedding: number[];
};
