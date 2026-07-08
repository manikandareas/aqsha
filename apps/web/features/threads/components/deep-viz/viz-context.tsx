"use client";

import { createContext, useCallback, useContext, useRef, type ReactNode } from "react";

/**
 * Context figur evidence viz. Kehadirannya SEKALIGUS gate render: provider hanya dipasang
 * `Response` untuk pesan laporan `/deep` (fence `aqsha:viz`-nya keluaran injector tepercaya).
 * Di luar itu — chat biasa, di mana fence semacam itu pasti tulisan model — komponen `deepviz`
 * melihat context `null` dan merender code block polos, bukan figur "resmi" (anti-pemalsuan).
 *
 * Nomor figur utama datang dari `block.figure` (di-stamp injector chat-core sesuai urutan
 * dokumen). `assign` = fallback mount-order untuk laporan lama yang dipersist sebelum field
 * `figure` ada: id blok → nomor urut saat pertama dirender (id unik per laporan → stabil
 * antar re-render dan selama streaming).
 */
const VizFigureContext = createContext<((id: string) => number) | null>(null);

export function useVizFigureAssign(): ((id: string) => number) | null {
  return useContext(VizFigureContext);
}

export function VizFigureProvider({ children }: { children: ReactNode }) {
  const registry = useRef(new Map<string, number>());
  const assign = useCallback((id: string) => {
    const numbers = registry.current;
    const existing = numbers.get(id);
    if (existing !== undefined) return existing;
    const next = numbers.size + 1;
    numbers.set(id, next);
    return next;
  }, []);
  return <VizFigureContext.Provider value={assign}>{children}</VizFigureContext.Provider>;
}
