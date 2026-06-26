import { describe, expect, test } from "bun:test";
import { parseAnalysis } from "../src/explore/analysis.service";

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
