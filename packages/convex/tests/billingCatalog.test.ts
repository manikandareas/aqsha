import { afterEach, describe, expect, it, vi } from "vitest";
import {
  billingStatusAllowsUsage,
  currentMonthPeriod,
  estimateCredits,
  estimateProviderCostCents,
  isPlanAtLeast,
  PLAN_CATALOG,
  PUBLIC_PLAN_KEYS,
  planForProductKey,
  requiredPlanForFeature,
} from "../convex/billing/catalog";
import {
  isAdminClerkUserId,
  isAdminEmail,
  isAdminOwnerUserId,
  isAdminUserDocumentId,
  parseAdminEmails,
  parseAdminIdentifiers,
} from "../convex/billing/admin";

describe("billing catalog", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defines Free, Starter, Plus, and internal Admin credit limits", () => {
    expect(PLAN_CATALOG.free.monthlyCredits).toBe(50);
    expect(PLAN_CATALOG.starter.monthlyCredits).toBe(500);
    expect(PLAN_CATALOG.plus.monthlyCredits).toBe(1_500);
    expect(PLAN_CATALOG.admin.monthlyCredits).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("keeps Deep Research as a simple monthly run quota", () => {
    // Free now gets a small taste of Deep Research (Lite); Pro-deep still
    // requires the Astra Pro agent (paid plan).
    expect(PLAN_CATALOG.free.deepResearchRuns).toBe(2);
    expect(PLAN_CATALOG.starter.deepResearchRuns).toBe(3);
    expect(PLAN_CATALOG.plus.deepResearchRuns).toBe(12);
    expect(PLAN_CATALOG.admin.deepResearchRuns).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("keeps Admin above Plus and out of public products", () => {
    expect(isPlanAtLeast("admin", "plus")).toBe(true);
    expect(PUBLIC_PLAN_KEYS).toEqual(["free", "starter", "plus"]);
  });

  it("maps Polar product keys to user-scoped plans", () => {
    expect(planForProductKey("starterMonthly")).toBe("starter");
    expect(planForProductKey("starterYearly")).toBe("starter");
    expect(planForProductKey("plusMonthly")).toBe("plus");
    expect(planForProductKey("plusYearly")).toBe("plus");
    expect(planForProductKey(undefined)).toBe("free");
  });

  it("keeps annual subscriptions on a monthly reset window", () => {
    const period = currentMonthPeriod(Date.UTC(2026, 4, 12));
    expect(period.key).toBe("2026-05");
    expect(period.resetAt).toBe(Date.UTC(2026, 5, 1));
  });

  it("requires paid entitlement for Deep Research", () => {
    expect(isPlanAtLeast("free", "starter")).toBe(false);
    expect(isPlanAtLeast("starter", "starter")).toBe(true);
    expect(isPlanAtLeast("plus", "starter")).toBe(true);
    expect(isPlanAtLeast("admin", "starter")).toBe(true);
  });

  it("parses admin emails case-insensitively", () => {
    const emails = parseAdminEmails(" VitoAndareas15@gmail.com,other@example.com ");
    expect(emails.has("vitoandareas15@gmail.com")).toBe(true);
  });

  it("parses admin identifiers without changing case", () => {
    const identifiers = parseAdminIdentifiers(" owner|User_A, user_ABC ");
    expect(identifiers.has("owner|User_A")).toBe(true);
    expect(identifiers.has("user_ABC")).toBe(true);
    expect(identifiers.has("user_abc")).toBe(false);
  });

  it("recognizes admin identities from deployment env", () => {
    vi.stubEnv("AQSHA_ADMIN_EMAILS", " VitoAndareas15@gmail.com ");
    vi.stubEnv("AQSHA_ADMIN_OWNER_USER_IDS", " https://issuer.example|user_admin ");
    vi.stubEnv("AQSHA_ADMIN_CLERK_USER_IDS", " user_3ELP9RQ5jR7WOgMuEpjQdCDOdND ");
    vi.stubEnv("AQSHA_ADMIN_USER_IDS", " q173f4c9rnbxbk1y3gzt00v9fh87kzm6 ");

    expect(isAdminEmail(" VitoAndareas15@gmail.com ")).toBe(true);
    expect(isAdminOwnerUserId(" https://issuer.example|user_admin ")).toBe(true);
    expect(isAdminClerkUserId(" user_3ELP9RQ5jR7WOgMuEpjQdCDOdND ")).toBe(true);
    expect(isAdminUserDocumentId(" q173f4c9rnbxbk1y3gzt00v9fh87kzm6 ")).toBe(true);
  });

  it("converts token and provider usage into credits and estimated cost", () => {
    expect(estimateCredits({ feature: "normal_chat", totalTokens: 1_501 })).toBe(2);
    expect(estimateCredits({ feature: "cited_answer", totalTokens: 1_501 })).toBe(2);
    expect(estimateCredits({ feature: "deep_research" })).toBe(120);
    expect(estimateCredits({ feature: "external_search", provider: "jina_read" })).toBe(2);
    expect(
      estimateProviderCostCents({
        provider: "openai",
        model: "gpt-5.5",
        inputTokens: 1_000,
        outputTokens: 1_000,
      }),
    ).toBe(2);
  });

  it("charges a flat per-run credit for sandbox compute, ignoring token count", () => {
    // Verification-engine runs are billed per-run, not per-token, so the credit
    // is constant regardless of how much text the sandbox processed.
    expect(estimateCredits({ feature: "sandbox_compute" })).toBe(10);
    expect(estimateCredits({ feature: "sandbox_compute", totalTokens: 50_000 })).toBe(10);
  });

  it("gates sandbox compute behind a paid plan, like pro chat", () => {
    expect(requiredPlanForFeature("sandbox_compute")).toBe("starter");
    expect(requiredPlanForFeature("pro_chat")).toBe("starter");
    expect(requiredPlanForFeature("normal_chat")).toBe("free");
    expect(requiredPlanForFeature("external_search")).toBe("free");
  });

  it("tracks citation verification without charging credits or gating a plan", () => {
    // citation_verify is usage-tracked but free: it composes already cached +
    // rate-limited scholarly providers (and the auto path runs in service mode,
    // so no per-user provider charge either). Charged 0, available to all tiers.
    expect(estimateCredits({ feature: "citation_verify" })).toBe(0);
    expect(estimateCredits({ feature: "citation_verify", totalTokens: 50_000 })).toBe(0);
    expect(requiredPlanForFeature("citation_verify")).toBe("free");
  });

  it("allows canceled subscription grace until current period end", () => {
    expect(
      billingStatusAllowsUsage({
        planKey: "starter",
        status: "canceled",
        currentPeriodEnd: Date.UTC(2026, 5, 1),
        now: Date.UTC(2026, 4, 12),
      }),
    ).toBe(true);
    expect(
      billingStatusAllowsUsage({
        planKey: "starter",
        status: "canceled",
        currentPeriodEnd: Date.UTC(2026, 4, 1),
        now: Date.UTC(2026, 4, 12),
      }),
    ).toBe(false);
  });
});
