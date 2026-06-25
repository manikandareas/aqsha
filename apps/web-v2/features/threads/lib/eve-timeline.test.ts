import type { EveAgentReducerEvent } from "eve/react";
import { describe, expect, it } from "vitest";
import type { ChatThreadEvent } from "../types";
import {
  eventsToTimeline,
  isStreamActive,
  mergeStreamEventLogs,
  recoverPending,
  reduceEventsToMessageData,
  streamIndexFromEvents,
} from "./eve-timeline";

/**
 * Bangun satu baris event persisted (payload = HandleMessageStreamEvent utuh). `id` =
 * `event_index` = urutan sisip = posisi stream eve (1:1). `createdAt` = id (monoton).
 * `data.sequence` SENGAJA = ordinal turn (sama untuk semua event satu turn, seperti eve
 * sungguhan) — ordering/cursor TAK boleh bergantung padanya.
 */
function ev(id: number, type: string, data: Record<string, unknown>): ChatThreadEvent {
  const turnOrdinal = Number(String(data.turnId ?? "turn_0").replace(/\D/g, "")) || 0;
  return {
    id,
    threadId: "t1",
    ownerUserId: "u1",
    eventIndex: id,
    type,
    turnId: typeof data.turnId === "string" ? data.turnId : null,
    payload: { type, data: { sequence: turnOrdinal, ...data } },
    createdAt: id,
  };
}

/** Event log mentah (payload) dari baris persisted — input adapter event-level. */
function payloads(rows: readonly ChatThreadEvent[]): EveAgentReducerEvent[] {
  return rows.map((r) => r.payload as EveAgentReducerEvent);
}

describe("isStreamActive", () => {
  it("kosong → tidak aktif", () => {
    expect(isStreamActive([])).toBe(false);
  });
  it("turn.started tanpa terminasi → aktif", () => {
    expect(isStreamActive([ev(0, "turn.started", { turnId: "turn1" })])).toBe(true);
  });
  it("turn.completed → settle", () => {
    const events = [
      ev(0, "turn.started", { turnId: "turn1" }),
      ev(5, "turn.completed", { turnId: "turn1" }),
    ];
    expect(isStreamActive(events)).toBe(false);
  });
  it("tool berjalan (last=action.result, turn belum selesai) → aktif", () => {
    const events = [
      ev(0, "turn.started", { turnId: "turn1" }),
      ev(1, "actions.requested", { turnId: "turn1", stepIndex: 0, actions: [] }),
      ev(2, "action.result", { turnId: "turn1", stepIndex: 0, status: "completed", result: {} }),
    ];
    expect(isStreamActive(events)).toBe(true);
  });
  it("PARKIR di session.waiting (persist 1:1) → NON-aktif", () => {
    const events = [
      ev(0, "turn.started", { turnId: "turn1" }),
      ev(1, "turn.completed", { turnId: "turn1" }),
      ev(2, "session.waiting", { turnId: "turn1" }),
    ];
    expect(isStreamActive(events)).toBe(false);
  });
});

describe("streamIndexFromEvents", () => {
  it("kosong → 0", () => {
    expect(streamIndexFromEvents([])).toBe(0);
  });
  it("max(event_index)+1 = posisi stream eve berikutnya (cursor resume)", () => {
    const events = [
      ev(0, "turn.started", { turnId: "turn_0" }),
      ev(1, "message.received", { turnId: "turn_0", message: "x" }),
      ev(2, "turn.completed", { turnId: "turn_0" }),
    ];
    expect(streamIndexFromEvents(events)).toBe(3);
  });
  it("tahan-gap: event hilang (mis. FK race) tetap menunjuk posisi berikutnya yang benar", () => {
    // event_index 0,1,3 (2 hilang) → max 3 → cursor 4 (BUKAN length 3) → resume tak overlap.
    const events = [
      ev(0, "turn.started", { turnId: "turn_0" }),
      ev(1, "message.received", { turnId: "turn_0", message: "x" }),
      ev(3, "message.completed", { turnId: "turn_0", message: "y" }),
    ];
    expect(streamIndexFromEvents(events)).toBe(4);
  });
});

describe("mergeStreamEventLogs", () => {
  it("streamed kosong → kembalikan salinan events apa adanya", () => {
    const base = payloads([ev(0, "turn.started", { turnId: "t" })]);
    const merged = mergeStreamEventLogs(base, []);
    expect(merged).toEqual(base);
  });
  it("event live baru di-append di belakang prefix persisted", () => {
    const base = payloads([
      ev(0, "turn.started", { turnId: "t" }),
      ev(1, "message.received", { turnId: "t", message: "halo" }),
    ]);
    const streamed = payloads([
      ev(2, "message.completed", { turnId: "t", stepIndex: 0, finishReason: "stop", message: "jawab" }),
      ev(3, "turn.completed", { turnId: "t" }),
    ]);
    const merged = mergeStreamEventLogs(base, streamed);
    expect(merged.length).toBe(4);
  });
  it("prefix yang ter-refetch (overlap JSON identik) di-dedup → tak dobel", () => {
    const a = ev(0, "turn.started", { turnId: "t" });
    const b = ev(1, "message.received", { turnId: "t", message: "halo" });
    const c = ev(2, "turn.completed", { turnId: "t" });
    // streamed mengandung ULANG a,b (persisted) + c baru → hasil tetap 3, bukan 5.
    const merged = mergeStreamEventLogs(payloads([a, b]), payloads([a, b, c]));
    expect(merged.length).toBe(3);
  });
});

describe("reduceEventsToMessageData / eventsToTimeline", () => {
  it("kosong → tak ada pesan", () => {
    expect(reduceEventsToMessageData([]).messages).toEqual([]);
    expect(eventsToTimeline([], false)).toEqual([]);
  });

  // Replay event log → timeline PENUH: user + teks asisten + TOOL CALL (dari actions.requested).
  it("rekonstruksi user + teks asisten + tool-call dari event log", () => {
    const turnId = "turn1";
    const timeline = eventsToTimeline(
      payloads([
        ev(0, "turn.started", { turnId }),
        ev(1, "message.received", { turnId, message: "halo" }),
        ev(2, "actions.requested", {
          turnId,
          stepIndex: 0,
          actions: [{ kind: "tool-call", callId: "c1", toolName: "search_web", input: { query: "x" } }],
        }),
        ev(3, "message.completed", { turnId, stepIndex: 0, finishReason: "stop", message: "jawaban" }),
        ev(4, "turn.completed", { turnId }),
      ]),
      false,
    );
    const user = timeline.find((m) => m.role === "user");
    const assistant = timeline.find((m) => m.role === "assistant");
    expect(user?.parts.some((p) => p.kind === "text" && p.text === "halo")).toBe(true);
    expect(assistant?.parts.some((p) => p.kind === "text" && p.text.includes("jawaban"))).toBe(true);
    expect(assistant?.parts.some((p) => p.kind === "tool" && p.model.name === "search_web")).toBe(true);
  });

  // Inti resume overlay: turn aktif = prefix persisted (seed) ++ lanjutan stream, di-reduce
  // BERSAMA (range disjoint) → identik dengan turn utuh. Tanpa seed, awal turn (user msg) hilang.
  it("reduce(seed ++ tail) == reduce(full) — awal turn tak hilang (overlay)", () => {
    const full = payloads([
      ev(0, "turn.started", { turnId: "turn1" }),
      ev(1, "message.received", { turnId: "turn1", message: "halo" }),
      ev(2, "actions.requested", {
        turnId: "turn1",
        stepIndex: 0,
        actions: [{ kind: "tool-call", callId: "c1", toolName: "search_web", input: { query: "x" } }],
      }),
      ev(3, "message.completed", { turnId: "turn1", stepIndex: 0, finishReason: "stop", message: "jawaban" }),
      ev(4, "turn.completed", { turnId: "turn1" }),
    ]);
    const seed = full.slice(0, 2); // event persisted (< startIndex=2)
    const tail = full.slice(2); // lanjutan resume (>= 2)
    expect(eventsToTimeline([...seed, ...tail], false)).toEqual(eventsToTimeline(full, false));
    // Tanpa seed (resume dari tengah) → user message "halo" hilang.
    expect(eventsToTimeline(tail, false).some((m) => m.role === "user")).toBe(false);
  });
});

describe("recoverPending", () => {
  const settledAfter = [ev(0, "turn.started", { turnId: "t" }), ev(5, "session.waiting", { turnId: "t" })];
  const stillRunning = [ev(0, "turn.started", { turnId: "t" }), ev(2, "message.appended", { turnId: "t" })];
  it("tanpa pesan / tanpa createdAt → null", () => {
    expect(recoverPending(stillRunning, null, 1)).toBeNull();
    expect(recoverPending(stillRunning, "hai", null)).toBeNull();
  });
  it("turn belum settle → kembalikan pesan (bubble tampil)", () => {
    expect(recoverPending(stillRunning, "hai", 1)).toBe("hai");
  });
  it("ada event settled SETELAH createdAt → null (turn selesai, bubble basi)", () => {
    expect(recoverPending(settledAfter, "hai", 1)).toBeNull();
  });
});
