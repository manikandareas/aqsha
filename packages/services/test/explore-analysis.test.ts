import { ExploreAnalysesRepo } from "@aqsha/db";
import { afterEach, describe, expect, spyOn, test } from "bun:test";
import * as embeddings from "../src/clients/embeddings";
import * as queue from "../src/clients/queue";
import { ExploreAnalysisService, parseAnalysis } from "../src/explore/analysis.service";

describe("parseAnalysis", () => {
  test("parse JSON ber-code-fence: num urut, novelty clamp, weight default", () => {
    const text =
      "```json\n" +
      JSON.stringify({
        gap: [
          { question: "Apa yang belum diteliti soal X?", citeA: "Liu 2025", citeB: "Park 2024", novelty: 140 },
        ],
        tension: {
          question: "Apakah Y valid?",
          support: [{ label: "Benchmark — Liu 2025", weight: 1.2 }],
          dispute: [{ label: "Reproduksi — Park 2024" }],
        },
      }) +
      "\n```";
    const r = parseAnalysis(text);
    expect(r.gap.length).toBe(1);
    expect(r.gap[0]!.num).toBe("01");
    expect(r.gap[0]!.novelty).toBe(100); // clamp 0..100
    expect(r.tension?.support[0]!.weight).toBe(1.2);
    expect(r.tension?.dispute[0]!.weight).toBe(1); // default saat absen
  });

  test("output non-JSON → kosong (soft-fail)", () => {
    expect(parseAnalysis("maaf, tidak ada data")).toEqual({ gap: [], tension: null });
  });

  test("tension tanpa pertanyaan → null", () => {
    const r = parseAnalysis(JSON.stringify({ gap: [], tension: { support: [], dispute: [] } }));
    expect(r.tension).toBeNull();
  });
});

const fakeDb = {} as never;
const DAY = 86_400_000;

describe("getOrStartAnalysis re-enqueue", () => {
  afterEach(() => {
    spyOn(ExploreAnalysesRepo, "findByQueryNorm").mockRestore();
    spyOn(ExploreAnalysesRepo, "upsertPending").mockRestore();
    spyOn(embeddings, "isEmbeddingEnabled").mockRestore();
    spyOn(queue, "removeJob").mockRestore();
    spyOn(queue, "enqueue").mockRestore();
  });

  // Regresi bug kritis: jobId STABIL (queryNorm) + BullMQ menahan job completed/failed →
  // re-add no-op → row stuck "pending". Fix = buang job lama SEBELUM enqueue. Test ini
  // gagal kalau removeJob tak dipanggil atau urutannya kebalik.
  test("recompute (row stale) buang job lama lalu enqueue, jobId sama", async () => {
    const staleRow = {
      id: "row-1",
      status: "ready",
      gap: [],
      tension: null,
      createdAt: Date.now() - 8 * DAY, // > TTL 7 hari → tak fresh → jatuh ke recompute
    } as never;

    const order: string[] = [];
    spyOn(ExploreAnalysesRepo, "findByQueryNorm").mockResolvedValue(staleRow);
    spyOn(embeddings, "isEmbeddingEnabled").mockReturnValue(false); // lewati embed/semantic
    const upsert = spyOn(ExploreAnalysesRepo, "upsertPending").mockResolvedValue({
      id: "row-1",
    } as never);
    const remove = spyOn(queue, "removeJob").mockImplementation(async () => {
      order.push("remove");
    });
    const enqueue = spyOn(queue, "enqueue").mockImplementation(async () => {
      order.push("enqueue");
      return "job-1";
    });

    const res = await ExploreAnalysisService.getOrStartAnalysis(fakeDb, "Agentic RAG");

    expect(res.status).toBe("pending");
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(order).toEqual(["remove", "enqueue"]); // buang DULU, baru enqueue
    expect(remove.mock.calls[0]![1]).toBe("agentic rag"); // jobId = queryNorm
    expect(enqueue.mock.calls[0]![2]).toEqual({ jobId: "agentic rag" });
  });

  test("exact pending & fresh → short-circuit, tak remove/enqueue", async () => {
    const freshPending = { id: "row-2", status: "pending", gap: null, tension: null, createdAt: Date.now() } as never;
    spyOn(ExploreAnalysesRepo, "findByQueryNorm").mockResolvedValue(freshPending);
    const remove = spyOn(queue, "removeJob").mockResolvedValue(undefined);
    const enqueue = spyOn(queue, "enqueue").mockResolvedValue("x");

    const res = await ExploreAnalysisService.getOrStartAnalysis(fakeDb, "Agentic RAG");

    expect(res.status).toBe("pending");
    expect(remove).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });
});
