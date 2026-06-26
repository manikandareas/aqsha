import type { EveAgentReducerEvent } from "eve/react";
import { describe, expect, it } from "vitest";
import type { ChatThreadEvent } from "../types";
import {
  acceptsFreeformText,
  buildOrderedLog,
  eventsToTimeline,
  type IndexedEvent,
  isApprovalRequest,
  isStreamActive,
  pendingInputRequests,
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
  it.each([
    "session.waiting",
    "session.completed",
    "session.failed",
    "turn.completed",
    "turn.failed",
    "input.requested",
  ])("%s → settle/parked", (type) => {
    expect(
      isStreamActive([
        ev(0, "turn.started", { turnId: "turn1" }),
        ev(1, type, { turnId: "turn1" }),
      ]),
    ).toBe(false);
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

describe("buildOrderedLog", () => {
  /** Snapshot persisted → IndexedEvent[] (index = event_index = posisi stream eve). */
  const indexed = (rows: readonly ReturnType<typeof ev>[]): IndexedEvent[] =>
    rows.map((r) => ({ index: r.eventIndex, event: r.payload as Parameters<typeof eventsToTimeline>[0][number] }));

  it("live kosong → snapshot apa adanya", () => {
    const snap = indexed([ev(0, "turn.started", { turnId: "t" })]);
    expect(buildOrderedLog(snap, [], 1)).toEqual(snap.map((s) => s.event));
  });
  it("ekor live di-append di belakang snapshot", () => {
    const snap = indexed([
      ev(0, "turn.started", { turnId: "t" }),
      ev(1, "message.received", { turnId: "t", message: "halo" }),
    ]);
    const live = payloads([
      ev(2, "message.completed", { turnId: "t", stepIndex: 0, finishReason: "stop", message: "jawab" }),
      ev(3, "turn.completed", { turnId: "t" }),
    ]);
    expect(buildOrderedLog(snap, live, 2).length).toBe(4);
  });
  it("overlap poll↔resume di-dedup by event_index → tak dobel", () => {
    // snapshot ter-poll sampai 0..3; resume mulai dari index 2 (overlap 2,3) + 4,5 baru.
    const snap = indexed([
      ev(0, "turn.started", { turnId: "t" }),
      ev(1, "message.received", { turnId: "t", message: "halo" }),
      ev(2, "actions.requested", { turnId: "t", stepIndex: 0, actions: [] }),
      ev(3, "action.result", { turnId: "t", stepIndex: 0, status: "completed", result: {} }),
    ]);
    const resumed = payloads([
      ev(2, "actions.requested", { turnId: "t", stepIndex: 0, actions: [] }),
      ev(3, "action.result", { turnId: "t", stepIndex: 0, status: "completed", result: {} }),
      ev(4, "message.completed", { turnId: "t", stepIndex: 0, finishReason: "stop", message: "jawab" }),
      ev(5, "turn.completed", { turnId: "t" }),
    ]);
    const merged = buildOrderedLog(snap, resumed, 2);
    expect(merged.length).toBe(6); // 0,1,2,3,4,5 — bukan 8
  });
  it("tahan-gap: index snapshot hilang tetap terurut, ekor live menyambung", () => {
    const snap = indexed([
      ev(0, "turn.started", { turnId: "t" }),
      ev(1, "message.received", { turnId: "t", message: "x" }),
      ev(3, "message.completed", { turnId: "t", message: "y" }), // index 2 hilang
    ]);
    const merged = buildOrderedLog(snap, payloads([ev(4, "turn.completed", { turnId: "t" })]), 4);
    expect(merged.length).toBe(4); // 0,1,3,4 terurut
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

describe("pendingInputRequests", () => {
  const turnId = "turn1";
  // Gerbang approval delete_artifact: prompt + label Inggris yang di-generate eve.
  const approvalRequested = ev(2, "input.requested", {
    turnId,
    stepIndex: 0,
    requests: [
      {
        requestId: "req1",
        action: { kind: "tool-call", callId: "c1", toolName: "delete_artifact", input: { artifactId: "a1" } },
        prompt: "Approve tool call: delete_artifact",
        options: [
          { id: "approve", label: "Yes" },
          { id: "deny", label: "No" },
        ],
        display: "confirmation",
        allowFreeform: false,
      },
    ],
  });
  // action.result setelah approval disetujui → tool jalan → output-available.
  const resultDone = ev(3, "action.result", {
    turnId,
    stepIndex: 0,
    status: "completed",
    result: { kind: "tool-result", callId: "c1", toolName: "delete_artifact", output: { ok: true } },
  });

  it("parkir di approval-requested → 1 pending + bawa toolName (utk lokalisasi)", () => {
    const pending = pendingInputRequests(payloads([ev(0, "turn.started", { turnId }), approvalRequested]));
    expect(pending).toHaveLength(1);
    expect(pending[0]?.requestId).toBe("req1");
    expect(pending[0]?.toolName).toBe("delete_artifact");
    expect(isApprovalRequest(pending[0]!)).toBe(true);
  });

  // INTI fix P0: setelah action.result, `inputResponse` TAK pernah di-set di event-log server,
  // tapi state part jadi output-available → JANGAN lagi tampak pending (kartu basi).
  it("setelah action.result (resolved) → 0 pending (tak muncul lagi)", () => {
    const pending = pendingInputRequests(
      payloads([ev(0, "turn.started", { turnId }), approvalRequested, resultDone]),
    );
    expect(pending).toHaveLength(0);
  });

  it("ask_question (opsi + allowFreeform) terdeteksi non-approval & boleh teks bebas", () => {
    const pending = pendingInputRequests(
      payloads([
        ev(0, "turn.started", { turnId }),
        ev(2, "input.requested", {
          turnId,
          stepIndex: 0,
          requests: [
            {
              requestId: "q1",
              action: { kind: "tool-call", callId: "c2", toolName: "ask_question", input: {} },
              prompt: "Rentang tahun?",
              options: [{ id: "5y", label: "5 tahun terakhir" }],
              allowFreeform: true,
            },
          ],
        }),
      ]),
    );
    expect(pending).toHaveLength(1);
    expect(isApprovalRequest(pending[0]!)).toBe(false);
    expect(acceptsFreeformText(pending[0]!)).toBe(true);
  });

  /** ask_question TAK pernah emit action.result; resolusinya = turn berikutnya dimulai. */
  function askQuestionTurn(turnStartIdx: number, t: string, requestId: string, callId: string) {
    return [
      ev(turnStartIdx, "turn.started", { turnId: t }),
      ev(turnStartIdx + 1, "input.requested", {
        turnId: t,
        stepIndex: 0,
        requests: [
          {
            requestId,
            action: { kind: "tool-call", callId, toolName: "ask_question", input: {} },
            prompt: `Q ${requestId}`,
            options: [{ id: "a", label: "A" }],
            allowFreeform: true,
          },
        ],
      }),
      ev(turnStartIdx + 2, "turn.completed", { turnId: t }),
    ];
  }

  // INTI bug issue-2: pertanyaan turn lama TANPA action.result + ada turn baru → TIDAK pending.
  it("ask_question turn lama + turn baru setelahnya → 0 pending (anti kartu basi)", () => {
    const pending = pendingInputRequests(
      payloads([
        ...askQuestionTurn(0, "turn_0", "q0", "c0"),
        ev(3, "turn.started", { turnId: "turn_1" }),
        ev(4, "message.completed", { turnId: "turn_1", stepIndex: 0, message: "Selesai." }),
        ev(5, "turn.completed", { turnId: "turn_1" }),
      ]),
    );
    expect(pending).toHaveLength(0);
  });

  // Replika screenshot: 3 pertanyaan di 3 turn → HANYA yang terakhir pending, tidak menumpuk.
  it("3 ask_question lintas turn → hanya pertanyaan turn TERAKHIR (tidak menumpuk)", () => {
    const pending = pendingInputRequests(
      payloads([
        ...askQuestionTurn(0, "turn_0", "q0", "c0"),
        ...askQuestionTurn(3, "turn_1", "q1", "c1"),
        ...askQuestionTurn(6, "turn_2", "q2", "c2"),
      ]),
    );
    expect(pending.map((p) => p.requestId)).toEqual(["q2"]);
  });
});
