import { describe, expect, it } from "vitest";
import { detectCitationVerifyIntent } from "../convex/agent/research/citationRouter";

describe("detectCitationVerifyIntent", () => {
  it("fires on standalone verification phrases (ID + EN)", () => {
    expect(detectCitationVerifyIntent("verifikasi sitasi paper ini")).toBe(true);
    expect(detectCitationVerifyIntent("periksa daftar pustaka dokumen ini")).toBe(true);
    expect(detectCitationVerifyIntent("verify the citations in this paper")).toBe(true);
    expect(detectCitationVerifyIntent("audit the bibliography please")).toBe(true);
  });

  it("fires on action verb + citation target", () => {
    expect(detectCitationVerifyIntent("tolong cek referensinya")).toBe(true);
    expect(detectCitationVerifyIntent("check this paper's references")).toBe(true);
    expect(detectCitationVerifyIntent("validate the DOIs in the rujukan list")).toBe(true);
  });

  it("does NOT fire on citation-adjacent but non-verification prompts", () => {
    expect(detectCitationVerifyIntent("tulis tinjauan pustaka dengan sitasi")).toBe(false);
    expect(detectCitationVerifyIntent("buatkan daftar pustaka untuk topik ini")).toBe(false);
    expect(detectCitationVerifyIntent("jelaskan metode penelitian")).toBe(false);
    expect(detectCitationVerifyIntent("check the methodology section")).toBe(false);
    expect(detectCitationVerifyIntent("")).toBe(false);
  });
});
