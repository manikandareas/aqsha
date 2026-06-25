"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Reveal teks streaming karakter-demi-karakter (in-house — ganti
 * `@convex-dev/agent/react` `useSmoothText` yang V2 tak punya & tak boleh impor).
 *
 * Append-only: target dibaca via ref tiap frame `requestAnimationFrame`, jadi teks
 * yang terus bertambah selama stream tetap mulus tanpa me-restart efek. Saat
 * `enabled=false` (part sudah `done` / history) → langsung tampil penuh.
 *
 * Hook ini dipasang per-part (key di renderer) → unmount/mount = reset natural
 * antar pesan, tak ada kursor yang bocor lintas turn.
 */
export function useSmoothText(
  text: string,
  opts?: { enabled?: boolean; charsPerTick?: number },
): string {
  const enabled = opts?.enabled ?? true;
  const speed = opts?.charsPerTick ?? 3;

  // Target dibaca via ref di dalam loop rAF; di-sync lewat efek (bukan saat render —
  // react-compiler melarang tulis ref di render).
  const targetRef = useRef(text);
  useEffect(() => {
    targetRef.current = text;
  }, [text]);

  const [shown, setShown] = useState(enabled ? "" : text);

  useEffect(() => {
    if (!enabled) {
      setShown(targetRef.current);
      return;
    }
    let raf = 0;
    let shownLen = 0;
    let lastSet = -1;
    let last = 0;
    const step = (ts: number) => {
      const target = targetRef.current;
      if (shownLen > target.length) shownLen = target.length; // teks menyusut/diganti
      if (shownLen < target.length) {
        if (!last) last = ts;
        const add = Math.max(1, Math.round(((ts - last) / 16) * speed));
        shownLen = Math.min(target.length, shownLen + add);
        last = ts;
      } else {
        last = 0;
      }
      if (shownLen !== lastSet) {
        lastSet = shownLen;
        setShown(target.slice(0, shownLen)); // hanya saat berubah → tak boros saat caught-up
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [enabled, speed]);

  return enabled ? shown : text;
}
