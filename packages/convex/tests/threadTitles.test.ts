/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";

// Stub the LLM so the scheduled generateThreadTitle action is hermetic — it
// returns a deterministic title without touching the network/provider key.
// vi.hoisted keeps the mock accessible to the hoisted vi.mock factory.
const { generateObjectMock } = vi.hoisted(() => ({
  generateObjectMock: vi.fn(async () => ({
    object: { title: "Efek kafein pada tidur" },
  })),
}));
vi.mock("ai", () => ({ generateObject: generateObjectMock }));

import { api, internal } from "../convex/_generated/api";
import schema from "../convex/schema";
import {
  isUsableGeneratedThreadTitle,
  normalizeGeneratedThreadTitle,
  truncateThreadTitle,
} from "../convex/agent/threadTitles";

// Auto-title generation (agent/threadTitles.ts) + its race-safe claim in
// agent/service:finalizeRun. The LLM branch of generateThreadTitle is not
// exercised here (it would hit the network); the orchestration glue that
// carries the concurrency risk — the claim, getTitleContext, and the terminal
// applyThreadTitle — is tested directly.

const modules = import.meta.glob("../convex/**/*.ts");
const TOKEN = "test-service-token";
const OWNER = "owner-titles";
const THREAD = "thr_titles-1";
const RUN = "run_titles-1";

function setup() {
  vi.stubEnv("AGENTS_SERVICE_TOKEN", TOKEN);
  return convexTest(schema, modules);
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  generateObjectMock.mockClear();
  generateObjectMock.mockResolvedValue({
    object: { title: "Efek kafein pada tidur" },
  });
});

// Run the scheduled generateThreadTitle job to completion. runAfter(0) jobs are
// pending (not yet in progress), so they need fake timers + finishAll.
async function drainScheduled(t: ReturnType<typeof convexTest>) {
  await t.finishAllScheduledFunctions(vi.runAllTimers);
}

async function seedThread(t: ReturnType<typeof convexTest>) {
  await t.mutation(api.agent.service.upsertThread, {
    serviceToken: TOKEN,
    threadId: THREAD,
    ownerUserId: OWNER,
    agentKind: "lite",
  });
}

async function seedMessage(
  t: ReturnType<typeof convexTest>,
  role: "user" | "assistant",
  text: string,
  status: "streaming" | "complete" | "error" = "complete",
) {
  await t.mutation(api.agent.service.createMessage, {
    serviceToken: TOKEN,
    threadId: THREAD,
    ownerUserId: OWNER,
    role,
    text,
    status,
  });
}

async function readThread(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) =>
    ctx.db
      .query("chatThreads")
      .withIndex("by_thread_id", (q) => q.eq("threadId", THREAD))
      .unique(),
  );
}

async function countScheduledTitleJobs(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const jobs = await ctx.db.system.query("_scheduled_functions").collect();
    return jobs.filter((job) => job.name.includes("generateThreadTitle")).length;
  });
}

async function createCompletableRun(t: ReturnType<typeof convexTest>) {
  await t.mutation(api.agent.service.createRun, {
    serviceToken: TOKEN,
    runId: RUN,
    threadId: THREAD,
    ownerUserId: OWNER,
    agentKind: "lite",
    mode: "normal",
  });
}

async function finalizeCompleted(t: ReturnType<typeof convexTest>) {
  await t.mutation(api.agent.service.finalizeRun, {
    serviceToken: TOKEN,
    runId: RUN,
    status: "completed",
  });
}

describe("thread title helpers", () => {
  it("normalizes by stripping quotes, collapsing whitespace, clamping length", () => {
    expect(normalizeGeneratedThreadTitle('  "Efek  kafein"  ')).toBe(
      "Efek kafein",
    );
    expect(normalizeGeneratedThreadTitle("`Judul`")).toBe("Judul");
    const long = "kata ".repeat(40);
    const clamped = truncateThreadTitle(long);
    expect(clamped.length).toBeLessThanOrEqual(80);
    expect(clamped.endsWith("…")).toBe(true);
  });

  it("rejects empty, fallback, and instruction-echo titles", () => {
    expect(isUsableGeneratedThreadTitle("")).toBe(false);
    expect(isUsableGeneratedThreadTitle("Percakapan baru")).toBe(false);
    expect(isUsableGeneratedThreadTitle("Chat baru")).toBe(false);
    expect(isUsableGeneratedThreadTitle("Request for thread title")).toBe(false);
    expect(isUsableGeneratedThreadTitle("Generate thread title")).toBe(false);
    expect(isUsableGeneratedThreadTitle("Efek kafein pada tidur")).toBe(true);
  });
});

describe("getTitleContext", () => {
  it("returns the first user prompt and first completed assistant answer", async () => {
    const t = setup();
    await seedThread(t);
    await seedMessage(t, "user", "Bagaimana efek kafein pada tidur?");
    await seedMessage(t, "assistant", "", "streaming"); // ignored: not complete
    await seedMessage(t, "assistant", "Kafein menunda onset tidur.");

    const context = await t.query(
      internal.agent.threadTitles.getTitleContext,
      { threadId: THREAD },
    );
    expect(context).toEqual({
      prompt: "Bagaimana efek kafein pada tidur?",
      assistantText: "Kafein menunda onset tidur.",
    });
  });

  it("returns null once the thread already has a title", async () => {
    const t = setup();
    await seedThread(t);
    await seedMessage(t, "user", "Pertanyaan awal");
    await t.mutation(internal.agent.threadTitles.applyThreadTitle, {
      threadId: THREAD,
      title: "Judul tetap",
    });
    const context = await t.query(
      internal.agent.threadTitles.getTitleContext,
      { threadId: THREAD },
    );
    expect(context).toBeNull();
  });
});

describe("applyThreadTitle", () => {
  it("sets the title and marks the claim ready (terminal)", async () => {
    const t = setup();
    await seedThread(t);
    await t.mutation(internal.agent.threadTitles.applyThreadTitle, {
      threadId: THREAD,
      title: "Efek kafein pada tidur",
    });
    const thread = await readThread(t);
    expect(thread).toMatchObject({
      title: "Efek kafein pada tidur",
      titleStatus: "ready",
    });
  });

  it("marks ready without a title when generation was unusable", async () => {
    const t = setup();
    await seedThread(t);
    await t.mutation(internal.agent.threadTitles.applyThreadTitle, {
      threadId: THREAD,
      title: undefined,
    });
    const thread = await readThread(t);
    expect(thread?.title).toBeUndefined();
    expect(thread?.titleStatus).toBe("ready");
  });

  it("never overwrites a title set in the meantime", async () => {
    const t = setup();
    await seedThread(t);
    await t.mutation(internal.agent.threadTitles.applyThreadTitle, {
      threadId: THREAD,
      title: "Judul pertama",
    });
    await t.mutation(internal.agent.threadTitles.applyThreadTitle, {
      threadId: THREAD,
      title: "Judul kedua",
    });
    const thread = await readThread(t);
    expect(thread?.title).toBe("Judul pertama");
  });
});

describe("finalizeRun title claim (race safety)", () => {
  it("schedules the generator exactly once across duplicate completions", async () => {
    const t = setup();
    await seedThread(t);
    await seedMessage(t, "user", "Bagaimana efek kafein pada tidur?");
    await createCompletableRun(t);
    vi.useFakeTimers();

    await finalizeCompleted(t);
    await finalizeCompleted(t); // idempotent service retry — must not re-claim

    const claimed = await readThread(t);
    expect(claimed?.titleStatus).toBe("generating");
    expect(await countScheduledTitleJobs(t)).toBe(1);

    // Drain the single scheduled generator → exactly one LLM call, title applied.
    await drainScheduled(t);
    expect(generateObjectMock).toHaveBeenCalledTimes(1);
    const titled = await readThread(t);
    expect(titled).toMatchObject({
      title: "Efek kafein pada tidur",
      titleStatus: "ready",
    });
  });

  it("marks the claim ready without a title when the model output is unusable", async () => {
    const t = setup();
    await seedThread(t);
    await seedMessage(t, "user", "Pertanyaan");
    await createCompletableRun(t);
    generateObjectMock.mockResolvedValueOnce({
      object: { title: "Percakapan baru" }, // blocked fallback echo
    });
    vi.useFakeTimers();

    await finalizeCompleted(t);
    await drainScheduled(t);

    const thread = await readThread(t);
    expect(thread?.title).toBeUndefined();
    expect(thread?.titleStatus).toBe("ready");
  });

  it("marks the claim ready when the model call throws (no infinite retry)", async () => {
    const t = setup();
    await seedThread(t);
    await seedMessage(t, "user", "Pertanyaan");
    await createCompletableRun(t);
    generateObjectMock.mockRejectedValueOnce(new Error("provider down"));
    vi.useFakeTimers();

    await finalizeCompleted(t);
    await drainScheduled(t);

    const thread = await readThread(t);
    expect(thread?.title).toBeUndefined();
    expect(thread?.titleStatus).toBe("ready");
  });

  it("does not claim when the run did not complete", async () => {
    const t = setup();
    await seedThread(t);
    await seedMessage(t, "user", "Pertanyaan");
    await createCompletableRun(t);

    await t.mutation(api.agent.service.finalizeRun, {
      serviceToken: TOKEN,
      runId: RUN,
      status: "failed",
      errorMessage: "boom",
    });

    const thread = await readThread(t);
    expect(thread?.titleStatus).toBeUndefined();
    expect(await countScheduledTitleJobs(t)).toBe(0);
  });

  it("does not re-claim a thread that already has a title", async () => {
    const t = setup();
    await seedThread(t);
    await seedMessage(t, "user", "Pertanyaan");
    await t.mutation(internal.agent.threadTitles.applyThreadTitle, {
      threadId: THREAD,
      title: "Judul sudah ada",
    });
    await createCompletableRun(t);

    await finalizeCompleted(t);

    const thread = await readThread(t);
    expect(thread?.title).toBe("Judul sudah ada");
    expect(thread?.titleStatus).toBe("ready");
    expect(await countScheduledTitleJobs(t)).toBe(0);
  });
});
