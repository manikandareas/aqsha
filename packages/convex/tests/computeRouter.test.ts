import { describe, expect, it } from "vitest";
import {
  detectStatVerificationIntent,
  routeCompute,
} from "../convex/agent/sandbox/computeRouter";

// Slice 1.2: the compute router is deterministic, so these assertions lock which
// prompts expose the sandbox verification tool. It must fire on explicit
// recompute/verify requests (ID + EN) and stay silent on ordinary reading,
// summarizing, or stats-explaining prompts (zero token waste).

describe("detectStatVerificationIntent", () => {
  const fires = [
    "cek konsistensi statistiknya",
    "verifikasi statistik paper ini",
    "cek p-value di tabel 3",
    "tolong hitung ulang signifikansinya",
    "verify the statistical consistency of this study",
    "recompute the p-values please",
    "power analysis untuk studi ini",
    "statcheck this paper",
    "reproduksi hasil uji statistiknya",
  ];
  for (const prompt of fires) {
    it(`fires on: "${prompt}"`, () => {
      expect(detectStatVerificationIntent(prompt)).toBe(true);
    });
  }

  const silent = [
    "ringkas paper ini",
    "apa kesimpulan utama studi ini?",
    "jelaskan metodologi statistik yang dipakai",
    "buatkan dokumen ringkasan",
    "check this document",
    "",
  ];
  for (const prompt of silent) {
    it(`stays silent on: "${prompt}"`, () => {
      expect(detectStatVerificationIntent(prompt)).toBe(false);
    });
  }
});

describe("routeCompute", () => {
  it("exposes verifyStatistics for Pro when compute intent is present", () => {
    expect(
      routeCompute({ prompt: "cek konsistensi statistiknya", agentKind: "pro" }),
    ).toEqual({ exposeStatVerification: true, intent: "stat_verification" });
  });

  it("withholds for Lite even when compute intent is present", () => {
    expect(
      routeCompute({ prompt: "cek konsistensi statistiknya", agentKind: "lite" }),
    ).toEqual({ exposeStatVerification: false, intent: null });
  });

  it("does not expose for Pro on an ordinary prompt", () => {
    expect(
      routeCompute({ prompt: "ringkas paper ini", agentKind: "pro" }),
    ).toEqual({ exposeStatVerification: false, intent: null });
  });
});
