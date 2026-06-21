"use client";

import { Button } from "@aqsha/ui/components/button";
import { ArrowUpIcon, SquareIcon } from "@aqsha/ui/icons";
import { useEffect, useState } from "react";

/** Notice blok kirim (Slice 6.2) — billing return-union / cooldown rate-limit. */
export type ComposerNotice = {
  message: string;
  /** Epoch-ms; bila ada → tampil hitung-mundur "(Ndetik)" sampai kirim diizinkan lagi. */
  retryAt?: number;
};

/** Sisa detik sampai `retryAt` (live tick per detik). 0 bila lewat / tak ada. */
function useSecondsLeft(retryAt?: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!retryAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [retryAt]);
  if (!retryAt) return 0;
  return Math.max(0, Math.ceil((retryAt - now) / 1000));
}

/**
 * Composer minimal (Slice 6.1, +notice 6.2) — textarea + kirim/stop + banner blok.
 * Token-editor / `/slash` / `@context` / attachment = slice lanjutan (6.6/6.7). Enter
 * kirim, Shift+Enter newline.
 */
export function Composer({
  onSend,
  onStop,
  busy,
  disabled,
  notice,
  placeholder = "Tulis pesan untuk Astra…",
}: {
  onSend: (text: string) => void;
  onStop?: () => void;
  busy?: boolean;
  disabled?: boolean;
  notice?: ComposerNotice | null;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");
  const secondsLeft = useSecondsLeft(notice?.retryAt);

  function submit() {
    const text = draft.trim();
    if (!text || busy || disabled) return;
    setDraft("");
    onSend(text);
  }

  return (
    <form
      className="flex flex-col gap-2 rounded-2xl border bg-background p-2"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {notice ? (
        <p className="px-2 pt-1 text-amber-600 text-xs dark:text-amber-500">
          {notice.message}
          {notice.retryAt && secondsLeft > 0 ? ` (${secondsLeft} detik)` : null}
        </p>
      ) : null}
      <div className="flex items-end gap-2">
      <textarea
        aria-label="Pesan untuk Astra"
        className="max-h-40 min-h-10 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none disabled:opacity-50"
        rows={1}
        placeholder={placeholder}
        value={draft}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
      />
      {busy && onStop ? (
        <Button type="button" size="icon" variant="outline" onClick={onStop} aria-label="Hentikan">
          <SquareIcon />
        </Button>
      ) : (
        <Button
          type="submit"
          size="icon"
          disabled={disabled || busy || draft.trim().length === 0}
          aria-label="Kirim"
        >
          <ArrowUpIcon />
        </Button>
      )}
      </div>
    </form>
  );
}
