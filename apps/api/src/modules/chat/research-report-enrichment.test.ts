import { describe, expect, it } from "bun:test";
import type { UIMessage } from "ai";
import { enrichDeepResearchReports } from "./research-report-enrichment";
import type { ChatSource } from "./store";

function makeAssistantMessage(text: string): UIMessage {
  return {
    id: "assistant-1",
    role: "assistant",
    parts: [{ type: "text", text }],
  } as UIMessage;
}

const validReport = {
  question: "What is X?",
  depth: "standard_brief",
  executiveSummary: "X is a concept demonstrated by multiple sources.",
  sections: [
    {
      heading: "Background",
      paragraphs: ["X originated in 1990s research."],
      citations: ["S1"],
    },
  ],
  evidenceConflicts: [],
  uncertainties: [],
  bibliography: [
    {
      id: "S1",
      chatSourceId: null,
      title: "Foundational paper",
      url: "https://Example.com/paper/?utm_source=rss",
      accessedAt: "2026-05-05T00:00:00.000Z",
    },
  ],
  decision: "PROCEED",
};

const sampleSources: ChatSource[] = [
  {
    id: "src-1",
    chatThreadId: "t1",
    runId: "r1",
    sourceKey: "key-1",
    kind: "url",
    title: "Foundational paper",
    url: "https://example.com/paper",
    filename: null,
    mediaType: null,
    providerSourceId: null,
    metadata: null,
    firstSeenAt: "2026-05-05T00:00:00.000Z",
    lastSeenAt: "2026-05-05T00:00:00.000Z",
    createdAt: "2026-05-05T00:00:00.000Z",
    updatedAt: "2026-05-05T00:00:00.000Z",
  } as unknown as ChatSource,
];

describe("enrichDeepResearchReports", () => {
  it("attaches the report to message metadata when text contains a valid object", () => {
    const messages: UIMessage[] = [
      makeAssistantMessage(JSON.stringify(validReport)),
    ];

    const out = enrichDeepResearchReports(messages, []);
    const meta = out[0]!.metadata as { deepResearchReport?: { question: string } };

    expect(meta?.deepResearchReport?.question).toBe("What is X?");
  });

  it("resolves chatSourceId via normalized URL match", () => {
    const messages: UIMessage[] = [
      makeAssistantMessage(JSON.stringify(validReport)),
    ];

    const out = enrichDeepResearchReports(messages, sampleSources);
    const meta = out[0]!.metadata as {
      deepResearchReport: {
        bibliography: { id: string; chatSourceId: string | null }[];
      };
    };

    expect(meta.deepResearchReport.bibliography[0]!.chatSourceId).toBe("src-1");
  });

  it("leaves chatSourceId null when no source matches the URL", () => {
    const reportWithUnknownUrl = {
      ...validReport,
      bibliography: [
        {
          ...validReport.bibliography[0]!,
          url: "https://unknown.com/page",
        },
      ],
    };
    const messages: UIMessage[] = [
      makeAssistantMessage(JSON.stringify(reportWithUnknownUrl)),
    ];

    const out = enrichDeepResearchReports(messages, sampleSources);
    const meta = out[0]!.metadata as {
      deepResearchReport: {
        bibliography: { chatSourceId: string | null }[];
      };
    };

    expect(meta.deepResearchReport.bibliography[0]!.chatSourceId).toBeNull();
  });

  it("returns the input messages unchanged when text is not a valid report", () => {
    const messages: UIMessage[] = [
      makeAssistantMessage("Just a normal markdown reply with no JSON."),
    ];

    const out = enrichDeepResearchReports(messages, sampleSources);
    expect(out).toBe(messages);
    expect(out[0]!.metadata).toBeUndefined();
  });

  it("ignores fenced JSON when payload misses required keys", () => {
    const messages: UIMessage[] = [
      makeAssistantMessage("```json\n{\"foo\":1}\n```"),
    ];

    const out = enrichDeepResearchReports(messages, sampleSources);
    expect(out).toBe(messages);
  });

  it("preserves existing metadata when adding the report", () => {
    const message = makeAssistantMessage(JSON.stringify(validReport));
    (message as unknown as { metadata: unknown }).metadata = { foo: "bar" };

    const out = enrichDeepResearchReports([message], sampleSources);
    const meta = out[0]!.metadata as {
      foo: string;
      deepResearchReport: unknown;
    };

    expect(meta.foo).toBe("bar");
    expect(meta.deepResearchReport).toBeDefined();
  });
});
