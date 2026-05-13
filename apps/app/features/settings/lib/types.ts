export type ProductKey = "starterMonthly" | "starterYearly" | "plusMonthly" | "plusYearly";

export type Viewer = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
};

export type BillingCurrent = {
  planKey: "free" | "starter" | "plus";
  planLabel: string;
  status: string;
  productKey: string | null;
  currentPeriodEnd: number | null;
  creditsLimit: number;
  creditsUsed: number;
  creditsRemaining: number;
  resetAt: number;
  providerSpendCeilingCents: number;
  estimatedCostCents: number;
};

export type Plan = {
  key: "free" | "starter" | "plus";
  label: string;
  monthlyPriceIdr: number;
  annualPriceIdr: number;
  monthlyCredits: number;
  providerSpendCeilingCents: number;
  features: string[];
  products: Array<{
    key: string;
    polarProductId: string | null;
    interval: "month" | "year";
    displayPriceIdr: number;
    configured: boolean;
  }>;
};

export type ActivityRow = {
  date: string;
  credits: number;
  estimatedCostCents: number;
  eventCount: number;
  featureCounts: {
    normal_chat: number;
    cited_answer: number;
    deep_research: number;
    external_search: number;
    source_ingest: number;
    rag_embedding: number;
  };
};

export type ThreadSummary = {
  threadId: string;
  title: string;
  createdAt: number;
  lastActivityAt: number;
  lastMessagePreview: string;
  messageCount: number;
  status: "idle" | "streaming" | "failed";
};
