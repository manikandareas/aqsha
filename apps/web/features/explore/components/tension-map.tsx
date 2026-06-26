"use client";

// Zona 2 kanan · Tension Map — neraca. Beam rotate(tilt); pan counter-rotate agar isi
// level. Hover sisi → condong. Data NYATA dari /explore/analysis (LLM stance atas korpus
// paper): support vs dispute + bobot (sitasi). Status didorong hasil analisis halaman.

import { useMemo, useState } from "react";
import { deriveTilt, type Lean, leanColorVar, leanLabel, sumWeights } from "../lib/tension-math";
import type { TensionClaim, TensionData } from "../types";
import type { GapStatus } from "./gap-finder";

const HOVER_TILT = 11;
const BEAM_TRANSITION = "transform 600ms cubic-bezier(.34,1.4,.5,1)";

export function TensionMap({ status, tension }: { status: GapStatus; tension: TensionData | null }) {
  const [lean, setLean] = useState<Lean | null>(null);
  const baseTilt = useMemo(
    () =>
      tension
        ? deriveTilt(sumWeights(tension.support), sumWeights(tension.dispute), 13)
        : 0,
    [tension],
  );
  const tilt = lean === "support" ? -HOVER_TILT : lean === "dispute" ? HOVER_TILT : baseTilt;

  const header = (
    <div className="mb-2 flex items-center gap-2.5">
      <h3 className="font-heading text-2xl font-semibold tracking-tight text-foreground">Tension Map</h3>
      {tension ? (
        <span className="ml-auto font-mono text-[10px] text-muted-foreground">
          condong ke <span style={{ color: leanColorVar(tilt) }}>{leanLabel(tilt)}</span>
        </span>
      ) : null}
    </div>
  );

  if (status === "idle" || status === "loading" || status === "error" || !tension) {
    return (
      <div className="flex flex-col py-[30px] pr-0 @3xl/explore:pl-[38px]">
        {header}
        <div className="mt-4 flex min-h-[220px] flex-1 items-center justify-center px-6 text-center font-mono text-[11px] text-muted-foreground">
          {status === "loading" ? (
            <span className="inline-flex items-center gap-2.5">
              <span className="inline-block size-3 animate-spin rounded-full border-2 border-border border-t-primary" />
              Menimbang bukti yang mendukung vs membantah…
            </span>
          ) : status === "error" ? (
            "Gagal menganalisis topik ini."
          ) : status === "idle" ? (
            "Cari topik untuk melihat peta tensi bukti."
          ) : (
            "Tak ada tensi menonjol untuk topik ini."
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col py-[30px] pr-0 @3xl/explore:pl-[38px]">
      {header}
      <p className="mb-2 text-[12.5px] leading-relaxed text-muted-foreground">{tension.question}</p>

      <div className="relative mx-1.5 min-h-[252px] flex-1">
        <div className="absolute bottom-[13px] left-1/2 h-[9px] w-[118px] -translate-x-1/2 rounded-[6px] bg-gradient-to-b from-muted-foreground to-muted-foreground/40 opacity-50" />
        <div className="absolute bottom-[19px] left-1/2 h-[5px] w-[62px] -translate-x-1/2 rounded bg-muted-foreground/40" />
        <div className="absolute bottom-[22px] left-1/2 h-[168px] w-[5px] -translate-x-1/2 rounded bg-gradient-to-b from-muted-foreground to-muted-foreground/40 opacity-60" />

        <div className="absolute left-[6%] right-[6%] top-16">
          <div
            className="relative h-1.5 rounded-[6px] bg-gradient-to-r from-border via-muted-foreground to-border"
            style={{ transformOrigin: "center", transform: `rotate(${tilt}deg)`, transition: BEAM_TRANSITION }}
          >
            <span className="absolute left-[9%] top-1/2 size-[7px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-muted-foreground" />
            <span className="absolute right-[9%] top-1/2 size-[7px] translate-x-1/2 -translate-y-1/2 rounded-full bg-muted-foreground" />
            <span className="absolute left-1/2 top-1/2 size-[18px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary bg-card shadow-[0_0_10px_color-mix(in_oklch,var(--primary)_45%,transparent)]" />
            <span className="absolute left-1/2 top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary" />

            <Pan
              anchor="left"
              tilt={tilt}
              tone="support"
              heading="Mendukung"
              claims={tension.support}
              onEnter={() => setLean("support")}
              onLeave={() => setLean(null)}
            />
            <Pan
              anchor="right"
              tilt={tilt}
              tone="dispute"
              heading="Membantah"
              claims={tension.dispute}
              onEnter={() => setLean("dispute")}
              onLeave={() => setLean(null)}
            />
          </div>
        </div>
      </div>

      <p className="mt-1.5 text-center font-mono text-[10px] text-muted-foreground">
        Arahkan kursor ke salah satu sisi · klaim menempel ke sitasi
      </p>
    </div>
  );
}

function Pan({
  anchor,
  tilt,
  tone,
  heading,
  claims,
  onEnter,
  onLeave,
}: {
  anchor: "left" | "right";
  tilt: number;
  tone: "support" | "dispute";
  heading: string;
  claims: TensionClaim[];
  onEnter: () => void;
  onLeave: () => void;
}) {
  const support = tone === "support";
  return (
    <div
      className={anchor === "left" ? "absolute left-[9%] top-1/2" : "absolute right-[9%] top-1/2"}
      style={{ transform: `rotate(${-tilt}deg)`, transition: BEAM_TRANSITION }}
    >
      <div className="-ml-[76px] w-[152px]">
        <svg width="152" height="30" viewBox="0 0 152 30" className="block">
          <line x1="76" y1="3" x2="17" y2="29" stroke="var(--border)" strokeWidth="1.2" />
          <line x1="76" y1="3" x2="135" y2="29" stroke="var(--border)" strokeWidth="1.2" />
          <circle cx="76" cy="3" r="3" fill="var(--muted-foreground)" />
        </svg>
        <div
          onMouseEnter={onEnter}
          onMouseLeave={onLeave}
          className={
            support
              ? "rounded-t-[10px] rounded-b-[18px] border border-mint-soft-border bg-mint-soft p-2.5"
              : "rounded-t-[10px] rounded-b-[18px] border border-coral-soft-border bg-coral-soft p-2.5"
          }
        >
          <div
            className={
              support
                ? "mb-2 flex items-center gap-1.5 font-mono text-[9.5px] text-mint-foreground"
                : "mb-2 flex items-center gap-1.5 font-mono text-[9.5px] text-coral-foreground"
            }
          >
            <span className={support ? "size-1.5 rounded-full bg-mint-foreground" : "size-1.5 rounded-full bg-coral-foreground"} />
            {heading}
          </div>
          <div className="flex flex-col gap-1.5">
            {claims.length === 0 ? (
              <div className="text-[11px] italic leading-snug text-muted-foreground">—</div>
            ) : (
              claims.map((c, i) => (
                <div key={`${c.label}-${i}`} className="text-[11px] leading-snug text-foreground">
                  {c.label}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
