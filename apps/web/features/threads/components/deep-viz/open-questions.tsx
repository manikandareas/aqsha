"use client";

import type { OpenQuestionsBlock } from "@aqsha/chat-core/deep-viz";

/**
 * Pertanyaan riset terbuka (ala Consensus): dua kolom Pertanyaan | Mengapa penting — kartu
 * membulat di kiri, alasan polos di kanan, pemisah hairline antar baris (stack di mobile).
 * Tombol panah prefill `/deep <question>` DITUNDA ke follow-up (keputusan terbuka #3 plan:
 * kanal draft composer butuh kerja baru — jangan bengkakkan slice ini).
 */
export function OpenQuestions({ block }: { block: OpenQuestionsBlock }) {
  return (
    <div className="grid min-w-0">
      <div className="hidden grid-cols-2 gap-x-6 border-b pb-2 text-[12px] text-foreground sm:grid">
        <span className="font-semibold">Pertanyaan</span>
        <span className="font-semibold">Mengapa penting</span>
      </div>
      <ul className="grid min-w-0">
        {block.items.map((item, i) => (
          <li
            key={`${i}-${item.question.slice(0, 24)}`}
            className="grid min-w-0 grid-cols-1 items-center gap-x-6 gap-y-2 border-b border-border/60 py-3 last:border-b-0 sm:grid-cols-2"
          >
            <p className="break-words rounded-xl border bg-muted/30 p-3 font-medium text-[13px] text-foreground leading-5">
              {item.question}
            </p>
            <p className="break-words text-[12.5px] text-muted-foreground leading-5">{item.why}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
