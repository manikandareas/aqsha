"use client";

import type { ClaimsEvidenceBlock } from "@aqsha/chat-core/deep-viz";
import { CLAIM_COLORS, CLAIM_LABELS, CLAIM_TRACK_COLORS } from "./labels";
import { PaperPills } from "./viz-block";

/**
 * Tabel klaim & bukti (ala Consensus): 4 kolom Klaim | Kekuatan bukti | Alasan | Paper.
 * Meter kekuatan = 10 batang vertikal; terisi = warna label (skor DETERMINISTIK builder
 * chat-core — bukan tulisan LLM), track = step lebih terang ramp yang sama; label teks di
 * bawah meter (kekuatan tak pernah color-alone). Wrapper `overflow-x-auto` (mobile).
 */
export function ClaimsEvidence({ block }: { block: ClaimsEvidenceBlock }) {
  return (
    <div className="min-w-0 overflow-x-auto">
      <table className="w-full min-w-[620px] border-collapse text-left text-[12.5px]">
        <thead>
          <tr className="border-b text-[12px] text-foreground">
            <th className="w-[28%] py-2.5 pr-4 font-semibold">Klaim</th>
            <th className="w-[19%] py-2.5 pr-4 font-semibold">Kekuatan bukti</th>
            <th className="w-[33%] py-2.5 pr-4 font-semibold">Alasan</th>
            <th className="py-2.5 font-semibold">Paper</th>
          </tr>
        </thead>
        <tbody>
          {block.claims.map((claim, i) => (
            <tr
              key={`${i}-${claim.text.slice(0, 24)}`}
              className="border-b border-border/60 align-top last:border-b-0"
            >
              <td className="py-4 pr-4">
                <p className="break-words font-medium text-foreground leading-5">{claim.text}</p>
              </td>
              <td className="py-4 pr-4">
                <StrengthMeter score={claim.score} label={claim.label} />
              </td>
              <td className="py-4 pr-4">
                <p className="break-words text-muted-foreground leading-5">{claim.reasoning}</p>
              </td>
              <td className="py-4">
                <PaperPills papers={claim.papers} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Meter 10 batang vertikal: terisi = round(score); label teks di bawah (bukan color-alone). */
function StrengthMeter({
  score,
  label,
}: {
  score: number;
  label: ClaimsEvidenceBlock["claims"][number]["label"];
}) {
  const filled = Math.round(Math.min(10, Math.max(0, score)));
  return (
    <div className="grid gap-1.5" title={`Skor ${score} dari 10`}>
      <div
        className="flex items-end gap-[3px]"
        role="img"
        aria-label={`Kekuatan bukti ${CLAIM_LABELS[label]} (skor ${score} dari 10)`}
      >
        {Array.from({ length: 10 }, (_, i) => (
          <span
            key={i}
            className="h-4 w-[5px] rounded-full"
            style={{
              background: i < filled ? CLAIM_COLORS[label] : CLAIM_TRACK_COLORS[label],
            }}
          />
        ))}
      </div>
      <span className="text-[11px] text-muted-foreground leading-4">{CLAIM_LABELS[label]}</span>
    </div>
  );
}
