"use client";

// Tile bento (kanan-bawah) · "Topik hangat". Subtopik paling aktif dari data Pulse
// (/explore/facets, OpenAlex group_by) → chip deep-link yang men-set query `q` halaman.
// Warna dot mirror seri streamgraph "Tren riset" di atasnya agar terbaca satu kesatuan.
// Mengisi ruang yang dulu kosong di kolom kanan hero.

import { useMemo } from "react";
import { bentoTileClass } from "@/lib/panel-surface";
import { TileHeader } from "./section-header";
import type { PulseData } from "../types";

// Selaras urutan warna seri di pulse-stream.tsx.
const COLORS = ["var(--sky-foreground)", "var(--coral)", "var(--lemon-foreground)", "var(--mint)"];
const MAX = 6;

export function HotTopics({
  pulse,
  loading,
  activeQuery,
  onSelect,
}: {
  pulse?: PulseData;
  loading?: boolean;
  activeQuery: string;
  onSelect: (q: string) => void;
}) {
  // Urut subtopik berdasarkan volume tahun terakhir (paling aktif dulu).
  const topics = useMemo(() => {
    const series = pulse?.series ?? [];
    return series
      .map((s, i) => ({
        name: s.name,
        latest: s.values[s.values.length - 1] ?? 0,
        color: COLORS[i % COLORS.length]!,
      }))
      .sort((a, b) => b.latest - a.latest)
      .slice(0, MAX);
  }, [pulse]);

  const active = activeQuery.trim().toLowerCase();

  return (
    <div className={bentoTileClass()}>
      <TileHeader title="Topik hangat" subtitle="ketuk untuk telusuri" />

      <div className="mt-3.5 min-h-0 flex-1">
        {loading && topics.length === 0 ? (
          <div className="flex flex-wrap gap-2">
            {[64, 92, 76, 110, 70].map((w) => (
              <span key={w} className="aqsha-shimmer h-7 rounded-full" style={{ width: w }} />
            ))}
          </div>
        ) : topics.length === 0 ? (
          <p className="font-mono text-[11px] text-muted-foreground">
            Belum ada subtopik aktif.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {topics.map((t) => {
              const isActive = t.name.toLowerCase() === active;
              return (
                <button
                  key={t.name}
                  type="button"
                  onClick={() => onSelect(t.name)}
                  aria-pressed={isActive}
                  className={[
                    "group inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] transition-[transform,border-color,color] duration-150 ease-out hover:-translate-y-px active:translate-y-0 active:scale-[0.97]",
                    isActive
                      ? "border-primary/50 bg-primary/10 text-foreground"
                      : "border-border bg-card/60 text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground",
                  ].join(" ")}
                >
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ background: t.color }}
                    aria-hidden
                  />
                  <span className="min-w-0 truncate">{t.name}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
