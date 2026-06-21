"use client";

import { Button } from "@aqsha/ui/components/button";
import { ArrowUpIcon, SquareIcon } from "@aqsha/ui/icons";
import { useState } from "react";

/**
 * Composer minimal (Slice 6.1) — textarea + kirim/stop. Token-editor / `/slash` /
 * `@context` / attachment = slice lanjutan (6.6/6.7). Enter kirim, Shift+Enter newline.
 */
export function Composer({
  onSend,
  onStop,
  busy,
  disabled,
  placeholder = "Tulis pesan untuk Astra…",
}: {
  onSend: (text: string) => void;
  onStop?: () => void;
  busy?: boolean;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");

  function submit() {
    const text = draft.trim();
    if (!text || busy || disabled) return;
    setDraft("");
    onSend(text);
  }

  return (
    <form
      className="flex items-end gap-2 rounded-2xl border bg-background p-2"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
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
    </form>
  );
}
