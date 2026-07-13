import { describe, expect, test } from "bun:test";
import { parseSampleRate, scrubLogAttributes } from "../src/observability";

describe("parseSampleRate", () => {
  test("nilai valid di-passthrough", () => {
    expect(parseSampleRate("0")).toBe(0);
    expect(parseSampleRate("0.01")).toBe(0.01);
    expect(parseSampleRate("1")).toBe(1);
  });

  test("kosong/undefined/null → fallback", () => {
    expect(parseSampleRate(undefined)).toBe(0);
    expect(parseSampleRate(null)).toBe(0);
    expect(parseSampleRate("")).toBe(0);
    expect(parseSampleRate(undefined, 0.1)).toBe(0.1);
  });

  test("NaN/non-numerik → fallback", () => {
    expect(parseSampleRate("abc")).toBe(0);
    expect(parseSampleRate("NaN")).toBe(0);
    expect(parseSampleRate("1,5")).toBe(0);
  });

  test("out-of-range di-clamp ke [0,1]", () => {
    expect(parseSampleRate("-1")).toBe(0);
    expect(parseSampleRate("2")).toBe(1);
    expect(parseSampleRate("1.5")).toBe(1);
    expect(parseSampleRate("-0.3")).toBe(0);
  });
});

describe("scrubLogAttributes", () => {
  test("membuang key sensitif (credential/PII)", () => {
    const out = scrubLogAttributes({
      requestId: "req_1",
      authorization: "Bearer xxx",
      cookie: "a=b",
      password: "hunter2",
      apiKey: "sk-123",
      api_key: "sk-123",
      accessKey: "AKIA",
      email: "user@example.com",
      userEmail: "user@example.com",
      signedUrl: "https://s3/...",
      prompt: "rahasia",
      completion: "rahasia",
      token: "t",
      bearerToken: "t",
    });
    expect(out).toEqual({ requestId: "req_1" });
  });

  test("hanya menyimpan skalar (string/number/boolean)", () => {
    const out = scrubLogAttributes({
      status: 500,
      ok: false,
      path: "/threads",
      nested: { a: 1 },
      list: [1, 2],
      missing: undefined,
      empty: null,
    });
    expect(out).toEqual({ status: 500, ok: false, path: "/threads" });
  });

  test("input kosong/undefined → objek kosong", () => {
    expect(scrubLogAttributes(undefined)).toEqual({});
    expect(scrubLogAttributes(null)).toEqual({});
    expect(scrubLogAttributes({})).toEqual({});
  });
});
