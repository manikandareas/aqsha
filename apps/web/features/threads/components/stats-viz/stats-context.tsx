"use client";

import type { StatsGroup } from "@aqsha/chat-core/stats-viz";
import { createContext, useCallback, useContext, useMemo, useRef, type ReactNode } from "react";

/**
 * Konteks render blok hasil analisis statistik (fase 3). Nilainya SEKALIGUS gerbang
 * anti-pemalsuan (paralel `VizFigureProvider` deep-viz): penanda `{{stats:<runKey>}}` yang
 * ditulis model hanya berubah jadi tabel/figur bila (a) provider terpasang (pesan ini punya
 * hasil `run_analysis` asli) DAN (b) `runKey`-nya ada di `groups` (blok ASLI dari DB, bukan
 * karangan). Di luar itu → penanda dirender kosong (tak ada teks mentah `{{stats:...}}` bocor).
 *
 * `assignTable`/`assignFigure` memberi nomor "Tabel n"/"Gambar n" berurutan sesuai urutan
 * render dokumen (inline dulu, lampiran menyusul) — sumber tunggal penomoran, idempoten per id
 * (aman untuk double-render React strict mode).
 */
type StatsVizContextValue = {
  groups: Map<string, StatsGroup>;
  assignTable: (id: string) => number;
  assignFigure: (id: string) => number;
};

const StatsVizContext = createContext<StatsVizContextValue | null>(null);

export function useStatsViz(): StatsVizContextValue | null {
  return useContext(StatsVizContext);
}

function assignFrom(registry: Map<string, number>, id: string): number {
  const existing = registry.get(id);
  if (existing !== undefined) return existing;
  const next = registry.size + 1;
  registry.set(id, next);
  return next;
}

export function StatsBlocksProvider({
  groups,
  children,
}: {
  groups: Map<string, StatsGroup>;
  children: ReactNode;
}) {
  const tableReg = useRef(new Map<string, number>());
  const figureReg = useRef(new Map<string, number>());
  const assignTable = useCallback((id: string) => assignFrom(tableReg.current, id), []);
  const assignFigure = useCallback((id: string) => assignFrom(figureReg.current, id), []);
  const value = useMemo<StatsVizContextValue>(
    () => ({ groups, assignTable, assignFigure }),
    [groups, assignTable, assignFigure],
  );
  return <StatsVizContext.Provider value={value}>{children}</StatsVizContext.Provider>;
}
