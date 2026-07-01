import { describe, expect, test } from "bun:test";
import {
  assistantMessageId,
  clerkClaimsToPrincipal,
  isOtherLikeOptionLabel,
  messagePreview,
  normalizeAskOtherOption,
  normalizeAskQuestions,
  ownershipVerdict,
  userMessageId,
} from "../src/index";

describe("normalizeAskOtherOption (dobel 'Lainnya')", () => {
  test("opsi 'Lainnya' model + allowOther → satu chip (opsi dibuang, allowOther true)", () => {
    const res = normalizeAskOtherOption(
      [{ label: "Teks" }, { label: "Lainnya", description: "Tulis sendiri" }],
      true,
    );
    expect(res.options.map((o) => o.label)).toEqual(["Teks"]);
    expect(res.allowOther).toBe(true);
  });

  test("opsi 'Lainnya…' tanpa allowOther → di-promote jadi allowOther", () => {
    const res = normalizeAskOtherOption([{ label: "A" }, { label: "Lainnya…" }], false);
    expect(res.options.map((o) => o.label)).toEqual(["A"]);
    expect(res.allowOther).toBe(true);
  });

  test("tanpa opsi other-like → tak berubah", () => {
    const res = normalizeAskOtherOption([{ label: "A" }, { label: "B" }], false);
    expect(res.options).toHaveLength(2);
    expect(res.allowOther).toBe(false);
  });

  test("isOtherLikeOptionLabel varian", () => {
    for (const l of [
      "Lainnya",
      "Lainnya…",
      "lainnya...",
      "Other",
      "others",
      "Tulis sendiri",
      "Lain-lain",
      "Lainnya (sebutkan)",
      "Other, specify",
    ]) {
      expect(isOtherLikeOptionLabel(l)).toBe(true);
    }
    // Opsi konkret yang kebetulan diawali "Other"/"Lainnya" TAK boleh dianggap sentinel isi-sendiri.
    for (const l of ["Teks/dokumen", "Data", "Ringkasan", "Other renewable sources", "Lainnya energi terbarukan"]) {
      expect(isOtherLikeOptionLabel(l)).toBe(false);
    }
  });
});

describe("normalizeAskQuestions", () => {
  test("payload bukan array → []", () => {
    expect(normalizeAskQuestions(null)).toEqual([]);
    expect(normalizeAskQuestions({ questions: [] })).toEqual([]);
  });

  test("item tanpa prompt dibuang; id fallback q{i+1}", () => {
    const out = normalizeAskQuestions([{ prompt: "" }, { prompt: "Fokus?" }]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: "q2", prompt: "Fokus?", kind: "single" });
  });

  test("opsi string + object, lipat 'Lainnya' → allowOther, hormati kind multi", () => {
    const out = normalizeAskQuestions([
      { id: "scope", prompt: "Pilih", kind: "multi", options: ["A", { label: "B", description: "d" }, "Lainnya"] },
    ]);
    expect(out[0]).toMatchObject({ id: "scope", kind: "multi", allowOther: true });
    expect(out[0]!.options.map((o) => o.label)).toEqual(["A", "B"]);
  });

  test("tanpa opsi → freeform murni (single + allowOther)", () => {
    const out = normalizeAskQuestions([{ prompt: "Bebas" }]);
    expect(out[0]).toMatchObject({ kind: "single", options: [], allowOther: true });
  });

  test("opts.max membatasi jumlah pertanyaan", () => {
    const raw = Array.from({ length: 5 }, (_, i) => ({ prompt: `Q${i}` }));
    expect(normalizeAskQuestions(raw, { max: 3 })).toHaveLength(3);
    expect(normalizeAskQuestions(raw)).toHaveLength(5);
  });
});

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
