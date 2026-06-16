import { describe, expect, it } from "vitest";
import { backoffDelayMs, isTransientConnectionError } from "../src/runs/retry";

describe("isTransientConnectionError", () => {
  it("matches the Bun socket-drop error a network switch produces", () => {
    // The exact string the service surfaces under Bun when the socket dies.
    expect(
      isTransientConnectionError(
        "API Error: The socket connection was closed unexpectedly. For more information, pass `verbose: true` in the second argument to fetch()",
      ),
    ).toBe(true);
  });

  it("matches common transport/DNS/availability faults (case-insensitive)", () => {
    for (const message of [
      "fetch failed",
      "ECONNRESET",
      "read ETIMEDOUT",
      "getaddrinfo ENOTFOUND api.example.com",
      "getaddrinfo EAI_AGAIN openrouter.ai",
      "socket hang up",
      "Client network socket disconnected before secure TLS connection was established",
      "terminated",
      "Connection error.",
      "upstream connect error or disconnect/reset before headers",
      "529 overloaded_error",
      "503 Service Unavailable",
      "502 Bad Gateway",
    ]) {
      expect(isTransientConnectionError(message), message).toBe(true);
    }
  });

  it("does NOT match terminal faults that should fail fast", () => {
    for (const message of [
      undefined,
      "",
      "provider exploded",
      "Claude Code returned an error result: Reached maximum number of turns (10)",
      "401 Unauthorized: invalid x-api-key",
      "invalid_request_error: prompt is too long",
      "Run budget exceeded (US$20 per dispatch)",
    ]) {
      expect(isTransientConnectionError(message), String(message)).toBe(false);
    }
  });
});

describe("backoffDelayMs", () => {
  const fixed = () => 0.5; // zero jitter (0.5 * 2 - 1 = 0)

  it("grows exponentially from the base and caps at maxMs", () => {
    const opts = { baseMs: 1000, maxMs: 8000, random: fixed };
    expect(backoffDelayMs({ attempt: 1, ...opts })).toBe(1000);
    expect(backoffDelayMs({ attempt: 2, ...opts })).toBe(2000);
    expect(backoffDelayMs({ attempt: 3, ...opts })).toBe(4000);
    expect(backoffDelayMs({ attempt: 4, ...opts })).toBe(8000);
    // Capped — never exceeds maxMs no matter how high the attempt.
    expect(backoffDelayMs({ attempt: 9, ...opts })).toBe(8000);
  });

  it("applies bounded jitter and never returns negative", () => {
    const low = backoffDelayMs({ attempt: 1, baseMs: 1000, maxMs: 8000, random: () => 0 });
    const high = backoffDelayMs({ attempt: 1, baseMs: 1000, maxMs: 8000, random: () => 1 });
    expect(low).toBe(800); // -20%
    expect(high).toBe(1200); // +20%
    expect(backoffDelayMs({ attempt: 1, baseMs: 1, maxMs: 1, random: () => 0 })).toBeGreaterThanOrEqual(0);
  });
});
