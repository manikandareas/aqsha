import { describe, expect, test } from "bun:test";
import { isInterestFieldId, topicsForInterestFields } from "../src/feed/interestKeywords";
import { isBackgroundId, isSourceId } from "../src/onboarding/options";

describe("interestKeywords", () => {
  test("topicsForInterestFields flatten + dedup + drop id tak dikenal", () => {
    expect(topicsForInterestFields(["fisika", "fisika", "tidak_ada"])).toEqual(["physics"]);
    expect(topicsForInterestFields(["ai_cs"])).toEqual([
      "artificial intelligence",
      "machine learning",
      "computer science",
    ]);
  });

  test("isInterestFieldId", () => {
    expect(isInterestFieldId("ai_cs")).toBe(true);
    expect(isInterestFieldId("ngawur")).toBe(false);
  });
});

describe("onboarding options", () => {
  test("isBackgroundId / isSourceId", () => {
    expect(isBackgroundId("peneliti")).toBe(true);
    expect(isBackgroundId("astronaut")).toBe(false);
    expect(isSourceId("lainnya")).toBe(true);
    expect(isSourceId("koran")).toBe(false);
  });
});
