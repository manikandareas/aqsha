import { describe, expect, it } from "vitest";
import { ProviderCache } from "../src/providers/cache";
import type { ProviderDeps } from "../src/providers/types";
import { MemoryStore } from "../src/store/memoryStore";
import { buildCitationTools } from "../src/tools/citations";
import type { RunToolContext } from "../src/tools/context";

// The citation_verify deep phase runs before any artifact exists, so the
// list-based verifyIdentifiers tool must drive the same four-step engine on a
// caller-supplied reference list (plan §4.2). verifyCitations keeps the
// artifact path; both share runVerificationBatch/tally.

type VerifyPayload = {
  status: string;
  summary: { checked: number; verified: number; flagged: number };
  items: Array<Record<string, unknown>>;
  caveat?: string;
};

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function crossrefMatch(title: string, doi: string): Response {
  return jsonResponse({
    message: {
      DOI: doi,
      title: [title],
      author: [{ given: "Ada", family: "Lovelace" }],
      published: { "date-parts": [[2021]] },
      "container-title": ["Journal of Widgets"],
    },
  });
}

// URL-aware fake: resolves two known DOIs to matching records, 404s every other
// identifier, and returns an empty OpenAlex result so unresolved references
// degrade to not_found (a flag, never a false accusation).
function fakeFetch(): typeof fetch {
  return (async (input: unknown) => {
    const url = String(input instanceof URL ? input.href : input).toLowerCase();
    if (url.includes("crossref")) {
      if (url.includes("10.1000")) return crossrefMatch("Quantum Widgets in Practice", "10.1000/valid");
      // Title-only record: the cited entry carries its own authors/year, so a
      // bare match avoids a spurious metadata_mismatch in the artifact path.
      if (url.includes("10.48550")) {
        return jsonResponse({
          message: { DOI: "10.48550/arxiv.1706.03762", title: ["Attention Is All You Need"] },
        });
      }
      return new Response("not found", { status: 404 });
    }
    if (url.includes("openalex")) return jsonResponse({ results: [] });
    return new Response("not found", { status: 404 });
  }) as unknown as typeof fetch;
}

function makeCtx(store: MemoryStore): RunToolContext {
  const providers: ProviderDeps = {
    cache: new ProviderCache(),
    env: {},
    fetchImpl: fakeFetch(),
  };
  return { runId: "run1", store, providers } as unknown as RunToolContext;
}

function findTool(store: MemoryStore, name: string) {
  const tool = buildCitationTools(makeCtx(store)).find((entry) => entry.name === name);
  if (!tool) throw new Error(`tool ${name} not built`);
  return tool;
}

async function call(
  tool: { handler: unknown },
  args: unknown,
): Promise<VerifyPayload> {
  const handler = tool.handler as (
    args: unknown,
    extra: unknown,
  ) => Promise<{ content: Array<{ text: string }> }>;
  const result = await handler(args, {});
  return JSON.parse(result.content[0]!.text) as VerifyPayload;
}

async function citationCheck(store: MemoryStore) {
  const events = await store.listRunEvents("run1");
  const event = events.find((entry) => entry.type === "citation_check");
  return event ? (JSON.parse(event.payloadJson) as Record<string, number>) : null;
}

describe("verifyIdentifiers", () => {
  it("runs the engine per reference, echoes [n], and emits citation_check", async () => {
    const store = new MemoryStore();
    const tool = findTool(store, "verifyIdentifiers");

    const payload = await call(tool, {
      references: [
        { title: "Quantum Widgets in Practice", doi: "10.1000/valid", citation: 1 },
        { title: "Totally Fabricated Paper", doi: "10.9999/fake", citation: 2 },
      ],
    });

    expect(payload.summary).toEqual({ checked: 2, verified: 1, flagged: 1 });
    // The [n] numbers survive verbatim, keyed to each verdict.
    expect(payload.items.map((item) => item.citation)).toEqual([1, 2]);
    expect(payload.items[0]).toMatchObject({ citation: 1, status: "verified" });
    expect(payload.items[1]).toMatchObject({ citation: 2, status: "not_found" });
    expect(payload.caveat).toContain("not an accusation");

    expect(await citationCheck(store)).toEqual({ checked: 2, verified: 1, flagged: 1 });
  });

  it("is read-only", () => {
    const tool = findTool(new MemoryStore(), "verifyIdentifiers");
    expect(tool.annotations?.readOnlyHint).toBe(true);
  });
});

describe("verifyCitations", () => {
  const DOCUMENT = `# Studi Transformer

Isi makalah membahas arsitektur attention.

## References

[1] Vaswani, A., Shazeer, N. (2017). "Attention Is All You Need". NeurIPS. https://doi.org/10.48550/arXiv.1706.03762

[2] Devlin, J., Chang, M. (2019). BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding. arXiv:1810.04805

[3] Brown, T. (2020). Language Models are Few-Shot Learners. NeurIPS 2020. doi:10.5555/3495724
`;

  it("still verifies an artifact bibliography through the shared batch helper", async () => {
    const store = new MemoryStore();
    store.seedArtifact({
      artifactId: "art1",
      title: "Studi Transformer",
      text: DOCUMENT,
      ownerUserId: "u1",
    });
    const tool = findTool(store, "verifyCitations");

    const payload = await call(tool, { artifactId: "art1" });

    expect(payload.summary.checked).toBe(3);
    // The resolvable DOI verifies; the unresolved ones degrade to not_found.
    expect(payload.summary.verified).toBe(1);
    expect(payload.items).toHaveLength(3);
    expect(await citationCheck(store)).toMatchObject({ checked: 3, verified: 1 });
  });

  it("reports a clean summary when no references section parses", async () => {
    const store = new MemoryStore();
    store.seedArtifact({
      artifactId: "art2",
      title: "Prosa",
      text: "Just prose, no bibliography.",
      ownerUserId: "u1",
    });
    const tool = findTool(store, "verifyCitations");

    const payload = await call(tool, { artifactId: "art2" });
    expect(payload.summary).toEqual({ checked: 0, verified: 0, flagged: 0 });
  });
});
