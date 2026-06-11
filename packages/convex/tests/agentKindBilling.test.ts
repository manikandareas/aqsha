import { describe, expect, it } from "vitest";
import { featureForUsage } from "../convex/billing/catalog";

// AUD-02: billing used to derive pro_chat vs normal_chat purely from the model
// string, so if lite and pro ever shared a model, pro usage billed as normal.
// featureForUsage attributes by the run's agent tier instead.
describe("featureForUsage (agentKind-aware billing)", () => {
  it("maps the run's agent tier to the billing feature, regardless of model", () => {
    // A pro run on the (unexpectedly) non-pro model is still pro_chat.
    expect(featureForUsage({ agentKind: "pro", isProModel: false })).toBe(
      "pro_chat",
    );
    // A lite run on the pro model is still normal_chat.
    expect(featureForUsage({ agentKind: "lite", isProModel: true })).toBe(
      "normal_chat",
    );
  });

  it("falls back to the model string when agentKind is absent (legacy/in-flight runs)", () => {
    expect(featureForUsage({ isProModel: true })).toBe("pro_chat");
    expect(featureForUsage({ isProModel: false })).toBe("normal_chat");
  });
});
