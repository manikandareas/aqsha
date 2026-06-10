import { describe, expect, it } from "vitest";
import { normalizeDoi } from "../convex/lib/identifiers";

describe("normalizeDoi (canonical, loose)", () => {
  it("strips a leading doi: prefix and lowercases", () => {
    expect(normalizeDoi("doi:10.1000/Xyz")).toBe("10.1000/xyz");
  });

  it("strips a https://doi.org/ prefix and lowercases", () => {
    expect(normalizeDoi("https://doi.org/10.1000/XYZ")).toBe("10.1000/xyz");
  });

  it("strips a https://dx.doi.org/ prefix and lowercases", () => {
    expect(normalizeDoi("https://dx.doi.org/10.1/A")).toBe("10.1/a");
  });

  it("passes a plain DOI through (only lowercasing)", () => {
    expect(normalizeDoi("10.1/a")).toBe("10.1/a");
  });
});
