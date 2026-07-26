/// <reference types="bun-types" />

import { expect, test } from "bun:test";
import { COMPARE_ROWS } from "./compare-rows";

test("first comparison contrasts ChatGPT with Aqsha", () => {
  expect(COMPARE_ROWS).toHaveLength(3);

  const [firstRow, secondRow, thirdRow] = COMPARE_ROWS;
  expect(firstRow?.fragmented.label).toBe("ChatGPT");
  expect(firstRow?.aqsha.label).toBe("Aqsha");
  expect(firstRow?.aqsha.steps).toHaveLength(3);

  expect(secondRow?.fragmented.label).toBe("ChatGPT");
  expect(secondRow?.aqsha.label).toBe("Aqsha");
  expect(secondRow?.aqsha.steps).toHaveLength(3);
  expect(secondRow?.aqsha.steps[0]?.text).toContain("Aqsha dilatih");

  expect(thirdRow?.fragmented.label).toBe("Mendeley / Zotero");
  expect(thirdRow?.aqsha.label).toBe("Aqsha");
  expect(thirdRow?.aqsha.steps).toHaveLength(3);
  expect(thirdRow?.aqsha.steps[1]?.text).toContain("Citation Manager");

  expect(JSON.stringify(COMPARE_ROWS)).toContain("ChatGPT");
  expect(JSON.stringify(COMPARE_ROWS)).toContain("Mendeley / Zotero");
  expect(JSON.stringify(COMPARE_ROWS)).not.toContain("Perplexity");
});
