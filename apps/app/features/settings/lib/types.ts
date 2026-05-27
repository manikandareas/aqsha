export type ProductKey = "starterMonthly" | "starterYearly" | "plusMonthly" | "plusYearly";
export type BillingInterval = "month" | "year";
export type SettingsTheme = "light" | "dark" | "system";

export type Viewer = {
  id: string;
  name: string | null;
  email: string | null;
  emailVerified: boolean;
  image: string | null;
};

export type BillingCurrent = {
  planKey: "free" | "starter" | "plus" | "admin";
  planLabel: string;
  status: string;
  productKey: string | null;
  billingInterval: BillingInterval | null;
  currentPeriodEnd: number | null;
  cancelAtPeriodEnd: boolean;
  isAdmin: boolean;
  isUnlimitedCredits: boolean;
  billingPortalAvailable: boolean;
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
  deepResearchRuns: number;
  workspaceLimit: number;
  libraryItemLimit: number;
  providerSpendCeilingCents: number;
  features: string[];
  products: Array<{
    key: ProductKey;
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
