import { describe, expect, test } from "bun:test";
import { pinoRecordToSentryLog } from "../src/lib/sentry-log-bridge";

describe("pinoRecordToSentryLog — severity policy", () => {
  test("fatal/error/warn selalu di-bridge", () => {
    expect(pinoRecordToSentryLog({ level: "fatal", msg: "boom" })?.level).toBe("fatal");
    expect(pinoRecordToSentryLog({ level: "error", msg: "boom" })?.level).toBe("error");
    expect(pinoRecordToSentryLog({ level: "warn", msg: "degraded" })?.level).toBe("warn");
  });

  test("debug/trace/level tak dikenal → null", () => {
    expect(pinoRecordToSentryLog({ level: "debug", msg: "x" })).toBeNull();
    expect(pinoRecordToSentryLog({ level: "trace", msg: "x" })).toBeNull();
    expect(pinoRecordToSentryLog({ level: 30, msg: "x" })).toBeNull();
  });

  test("info hanya di-bridge bila notable:true", () => {
    expect(pinoRecordToSentryLog({ level: "info", msg: "request", path: "/x" })).toBeNull();
    const notable = pinoRecordToSentryLog({ level: "info", msg: "api_started", notable: true, port: 3001 });
    expect(notable?.level).toBe("info");
    expect(notable?.message).toBe("api_started");
    expect(notable?.attributes.port).toBe(3001);
  });

  test("access-log per-request (info non-notable) tak pernah di-bridge", () => {
    const accessLog = { level: "info", msg: "request", requestId: "r1", method: "GET", path: "/feed", status: 200, ms: 12 };
    expect(pinoRecordToSentryLog(accessLog)).toBeNull();
  });
});

describe("pinoRecordToSentryLog — atribut", () => {
  test("hanya allowlist field low-cardinality yang menjadi atribut", () => {
    const rec = {
      level: "error",
      msg: "unexpected_error",
      requestId: "req_9",
      method: "POST",
      path: "/threads",
      // Field yang HARUS tak bocor:
      authorization: "Bearer secret",
      ownerUserId: "user_123",
      email: "a@b.com",
      body: { prompt: "rahasia" },
    };
    const out = pinoRecordToSentryLog(rec);
    expect(out?.attributes).toEqual({ requestId: "req_9", method: "POST", path: "/threads" });
  });

  test("ms → durationMs, worker → queue", () => {
    const out = pinoRecordToSentryLog({ level: "warn", msg: "job_failed", worker: "artifact-indexing", jobId: "j1", ms: 340 });
    expect(out?.attributes.queue).toBe("artifact-indexing");
    expect(out?.attributes.durationMs).toBe(340);
    expect(out?.attributes).not.toHaveProperty("worker");
  });

  test("err → errorType/errorCode/errorStatus (tanpa message/stack)", () => {
    const out = pinoRecordToSentryLog({
      level: "error",
      msg: "unexpected_error",
      err: { type: "AppError", message: "isi sensitif", stack: "at foo", code: "conflict", status: 409, detail: "row=..." },
    });
    expect(out?.attributes.errorType).toBe("AppError");
    expect(out?.attributes.errorCode).toBe("conflict");
    expect(out?.attributes.errorStatus).toBe(409);
    // message/stack/detail TIDAK boleh ikut sebagai atribut.
    expect(JSON.stringify(out?.attributes)).not.toContain("isi sensitif");
    expect(JSON.stringify(out?.attributes)).not.toContain("row=");
  });

  test("message fallback ke level bila msg kosong", () => {
    expect(pinoRecordToSentryLog({ level: "error" })?.message).toBe("error");
  });
});
