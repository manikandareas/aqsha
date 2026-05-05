import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { searchPubmed } from "../pubmed";

const ESEARCH_RESPONSE = {
  esearchresult: {
    idlist: ["12345678", "87654321"],
  },
};

const ESUMMARY_RESPONSE = {
  result: {
    "12345678": {
      uid: "12345678",
      title: "Semaglutide for Pediatric Obesity: An RCT",
      authors: [
        { name: "Smith J" },
        { name: "Doe A" },
      ],
      pubdate: "2024 Mar 15",
      fulljournalname: "New England Journal of Medicine",
      articleids: [
        { idtype: "pubmed", value: "12345678" },
        { idtype: "doi", value: "10.1056/NEJMoa2403001" },
      ],
    },
    "87654321": {
      uid: "87654321",
      title: "Long-term Outcomes Review",
      pubdate: "2023",
      fulljournalname: "Lancet",
      articleids: [{ idtype: "pubmed", value: "87654321" }],
    },
  },
};

const originalFetch = globalThis.fetch;

describe("searchPubmed", () => {
  beforeEach(() => {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("esearch.fcgi")) {
        return new Response(JSON.stringify(ESEARCH_RESPONSE), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.includes("esummary.fcgi")) {
        // URLSearchParams encodes the comma between PMIDs to %2C.
        expect(url).toContain("id=12345678%2C87654321");
        return new Response(JSON.stringify(ESUMMARY_RESPONSE), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      throw new Error(`Unexpected URL in test: ${url}`);
    }) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("merges esearch + esummary into normalized records with pubmed URLs and DOI extraction", async () => {
    const candidates = await searchPubmed("semaglutide pediatric obesity");

    expect(candidates).toHaveLength(2);

    const [first, second] = candidates;

    expect(first.url).toBe("https://pubmed.ncbi.nlm.nih.gov/12345678/");
    expect(first.title).toBe("Semaglutide for Pediatric Obesity: An RCT");
    expect(first.authors).toEqual(["Smith J", "Doe A"]);
    expect(first.doi).toBe("10.1056/NEJMoa2403001");
    expect(first.provider).toBe("pubmed");
    expect(first.raw?.journal).toBe("New England Journal of Medicine");

    expect(second.url).toBe("https://pubmed.ncbi.nlm.nih.gov/87654321/");
    expect(second.doi).toBeNull();
    expect(second.authors).toEqual([]);
  });
});
