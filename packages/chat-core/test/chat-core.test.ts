import { describe, expect, test } from "bun:test";
import {
  assistantMessageId,
  clerkClaimsToPrincipal,
  messagePreview,
  ownershipVerdict,
  userMessageId,
} from "../src/index";

describe("clerkClaimsToPrincipal", () => {
  test("no sub → null", () => {
    expect(clerkClaimsToPrincipal({})).toBeNull();
    expect(clerkClaimsToPrincipal({ sub: 123 as never })).toBeNull();
  });

  test("sub → user principal; email/org attributes; iss issuer", () => {
    expect(
      clerkClaimsToPrincipal({
        sub: "user_1",
        email: "a@b.com",
        org_id: "org_9",
        iss: "https://clerk.example",
      }),
    ).toEqual({
      principalId: "user_1",
      principalType: "user",
      authenticator: "clerk",
      subject: "user_1",
      issuer: "https://clerk.example",
      attributes: { email: "a@b.com", orgId: "org_9" },
    });
  });

  test("sub only → empty attributes, no issuer", () => {
    expect(clerkClaimsToPrincipal({ sub: "user_2" })).toEqual({
      principalId: "user_2",
      principalType: "user",
      authenticator: "clerk",
      subject: "user_2",
      attributes: {},
    });
  });
});

describe("ownershipVerdict", () => {
  test("null → not_found; match → ok; mismatch → forbidden", () => {
    expect(ownershipVerdict(null, "user_1")).toBe("not_found");
    expect(ownershipVerdict({ ownerUserId: "user_1" }, "user_1")).toBe("ok");
    expect(ownershipVerdict({ ownerUserId: "user_2" }, "user_1")).toBe("forbidden");
  });
});

describe("messagePreview", () => {
  test("collapse + clamp 160 with ellipsis", () => {
    expect(messagePreview("  halo   dunia\n\nastra ")).toBe("halo dunia astra");
    const out = messagePreview("x".repeat(300));
    expect(Array.from(out).length).toBe(160);
    expect(out.endsWith("…")).toBe(true);
  });
});

describe("deterministic message ids", () => {
  test("user/assistant id shapes", () => {
    expect(userMessageId("s1", "t1")).toBe("s1:t1:user");
    // assistant keyed by sequence (collision-proof across multi-message turns)
    expect(assistantMessageId("s1", "t1", 5)).toBe("s1:t1:5:assistant");
    expect(assistantMessageId("s1", "t1", 7)).not.toBe(assistantMessageId("s1", "t1", 5));
  });
});
