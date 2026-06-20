import { describe, expect, it } from "vitest";
import { parseBatchExecuteUrl } from "../convex/feed/providers/googleNewsDecode";

// The batchexecute response is the XSSI guard `)]}'` followed by length-prefixed
// JSON chunks; the decoded URL lives in the Fbv4je (`garturlres`) inner payload.
function batchExecuteResponse(decodedUrl: string): string {
  const inner = JSON.stringify(["garturlres", decodedUrl, null, null, null, []]);
  const chunk = JSON.stringify([
    ["wrb.fr", "Fbv4je", inner, null, null, null, "generic"],
  ]);
  return `)]}'\n\n${chunk.length}\n${chunk}\n26\n[["di",27],["af.httprm",26,"x",5]]\n`;
}

describe("parseBatchExecuteUrl", () => {
  it("extracts the publisher URL from a well-formed response", () => {
    const url = "https://www.kompas.com/sains/read/2026/06/11/uji-vaksin";
    expect(parseBatchExecuteUrl(batchExecuteResponse(url))).toBe(url);
  });

  it("returns null when no Fbv4je URL is present or input is garbage", () => {
    expect(parseBatchExecuteUrl(")]}'\n\n12\n[[\"di\",3]]")).toBeNull();
    expect(parseBatchExecuteUrl("totally not json")).toBeNull();
    expect(parseBatchExecuteUrl("")).toBeNull();
  });
});
