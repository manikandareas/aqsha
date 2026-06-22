import { describe, expect, it } from "vitest";
import { decodePaperRef, encodePaperRef } from "./paper-ref";

describe("paper refs", () => {
  it("round-trips DOI keys with URL-sensitive characters", () => {
    const key = "doi:10.1145/1234567.890?foo=bar#section";

    expect(decodePaperRef(encodePaperRef(key))).toBe(key);
  });

  it("keeps route refs path-safe", () => {
    expect(encodePaperRef("url:example.com/a/b")).not.toContain("/");
  });
});
