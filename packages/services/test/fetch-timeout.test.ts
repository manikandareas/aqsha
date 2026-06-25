/**
 * Regression guard for the `/deep` wedge (root cause): `fetchWithTimeout` used to
 * arm an AbortController and `clearTimeout` it in `finally` the instant `fetch()`
 * resolved — i.e. on HEADERS. The caller's `await response.json()/.text()` then ran
 * with no deadline, so a host that sends headers then stalls its body hung the read
 * forever and froze the whole research run. The fix uses a self-firing
 * `AbortSignal.timeout` that stays armed through body consumption.
 *
 * This test FAILS (hangs → 30s test-timeout) if that disarm-on-headers bug returns.
 */
import { afterAll, beforeAll, expect, test } from "bun:test";
import { createServer, type Server } from "node:http";
import { fetchWithTimeout } from "../src/papers/http";

let server: Server;
let base: string;

beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === "/ok") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("hello");
      return;
    }
    // /stall: headers + partial body arrive immediately, then never finish.
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.write("partial");
    // intentionally no res.end() — the body hangs forever
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
});

afterAll(() => {
  server.close();
});

test("aborts a stalled BODY read at the deadline, not just headers", async () => {
  const start = Date.now();
  await expect(
    (async () => {
      const res = await fetchWithTimeout(`${base}/stall`, { timeoutMs: 200 });
      return res.text(); // used to hang forever once headers had arrived
    })(),
  ).rejects.toThrow();
  expect(Date.now() - start).toBeLessThan(2_000);
});

test("normal fast response still completes (happy path not broken)", async () => {
  const res = await fetchWithTimeout(`${base}/ok`, { timeoutMs: 5_000 });
  expect(await res.text()).toBe("hello");
});
