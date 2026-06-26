/**
 * Regression guard for the /deep freeze: a stalled model gateway stream must abort at
 * the idle deadline (so eve gets a retryable turn error), while a slow-but-progressing
 * stream must pass through untouched. `withIdleTimeout` is fed a FAKE baseFetch with a
 * scripted body — no network, deterministic.
 *
 * This test HANGS (→ bun test timeout) if the disarm/arm idle logic regresses.
 */
import { expect, test } from "bun:test";
import { withIdleTimeout } from "../agent/lib/idle-fetch.ts";

const enc = new TextEncoder();

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(signal.reason ?? new Error("aborted"));
      },
      { once: true },
    );
  });
}

/** Fake fetch whose body runs a script of {chunk, gap} or {stall:true}. */
function scriptedFetch(
  steps: Array<{ chunk?: string; gap?: number; stall?: boolean }>,
): typeof fetch {
  return (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const signal = init?.signal ?? undefined;
    const queue = [...steps];
    const body = new ReadableStream<Uint8Array>({
      async pull(ctrl) {
        const step = queue.shift();
        if (!step) {
          ctrl.close();
          return;
        }
        try {
          if (step.gap) await sleep(step.gap, signal);
          if (step.stall) {
            // never resolves until the (merged) signal aborts
            await new Promise((_resolve, reject) =>
              signal?.addEventListener("abort", () => reject(signal.reason), { once: true }),
            );
          }
          ctrl.enqueue(enc.encode(step.chunk ?? "x"));
        } catch (err) {
          ctrl.error(err);
        }
      },
    });
    return new Response(body, { status: 200 });
  }) as typeof fetch;
}

async function drain(res: Response): Promise<string> {
  const reader = res.body!.getReader();
  let out = "";
  const dec = new TextDecoder();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    out += dec.decode(value);
  }
  return out;
}

test("aborts when the server stalls mid-stream past the idle deadline", async () => {
  const wrapped = withIdleTimeout(scriptedFetch([{ chunk: "a", gap: 5 }, { stall: true }]), 80);
  const start = Date.now();
  await expect(drain(await wrapped("http://x"))).rejects.toThrow();
  expect(Date.now() - start).toBeLessThan(1_000);
});

test("passes a steady stream through untouched (no false abort)", async () => {
  const wrapped = withIdleTimeout(
    scriptedFetch([
      { chunk: "a", gap: 10 },
      { chunk: "b", gap: 10 },
      { chunk: "c", gap: 10 },
    ]),
    200,
  );
  expect(await drain(await wrapped("http://x"))).toBe("abc");
});
