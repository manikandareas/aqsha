"use client";

import { useEffect, useState } from "react";
import { Shimmer } from "@/components/ai-elements/shimmer";

/**
 * Label "bekerja" dengan elapsed yang berdetak (muncul setelah 10 dtk). Riset mendalam yang
 * menunggu subagent task-mode bisa diam bermenit-menit tanpa event (child stream tak di-stream
 * ke induk: `childSessionId` 0 baris); timer yang jalan meyakinkan "masih bekerja", bukan beku.
 * Terisolasi → hanya komponen ini yang re-render tiap detik.
 *
 * Dipakai blok "Proses" (`message-list`) DAN row subagent-call yang running (`tool-row`).
 * ponytail: hitung dari mount (`Date.now()`), bukan `createdAt` event aktif pertama — reset saat
 * refresh tapi tetap menunjukkan gerak; presisi lintas-reload = upgrade opsional.
 */
export function ElapsedLabel({ base }: { base: string }) {
  const [start] = useState(() => Date.now());
  const [now, setNow] = useState(start);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const secs = Math.floor((now - start) / 1000);
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  const label = secs < 10 ? `${base}…` : `${base}… ${m > 0 ? `${m}m ` : ""}${s}s`;
  return (
    <Shimmer as="span" className="font-medium">
      {label}
    </Shimmer>
  );
}
