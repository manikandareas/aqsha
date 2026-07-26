/// <reference types="bun-types" />

import { expect, test } from "bun:test";
import { COMPARE_ROWS } from "./compare-rows";

test("comparison rows contrast workflows without naming competitors", () => {
  expect(COMPARE_ROWS).toHaveLength(3);
  for (const row of COMPARE_ROWS) {
    expect(row.fragmented.label).toBe("Alur terpencar");
    expect(row.aqsha.label).toBe("Di Aqsha");
    expect(row.aqsha.steps.length).toBeGreaterThan(1);
  }
  expect(JSON.stringify(COMPARE_ROWS)).not.toContain("ChatGPT");
  expect(JSON.stringify(COMPARE_ROWS)).not.toContain("Perplexity");
});
