"use client";

// Ask-bar hero. Mengetik → saran kueri LLM (typeahead, /explore/suggest). Enter / klik
// saran → set query `q` halaman (nuqs) → semua section di bawah (chart, gap, tension,
// globe, feed) bereaksi ke topik itu. Sumber pencarian penuh tampil di feed Zona 4.

import { SearchIcon, XIcon } from "@aqsha/ui/icons";
import { useEffect, useRef, useState } from "react";
import { useExploreSuggest } from "../api";

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

export function ExploreAskBar({
  value,
  onSubmit,
}: {
  value: string;
  onSubmit: (q: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [focused, setFocused] = useState(false);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Sinkronkan draft saat `value` (URL q) berubah dari luar — adjust-state-saat-render
  // (pola React: dua state pembanding), bukan setState dalam effect.
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    setDraft(value);
  }

  const debounced = useDebounced(draft.trim(), 250);
  const suggest = useExploreSuggest(focused ? debounced : "");
  const suggestions = suggest.data ?? [];
  const open = focused && draft.trim().length >= 2 && suggestions.length > 0;

  const submit = (next?: string) => {
    const q = (next ?? draft).trim();
    if (!q) return;
    setDraft(q);
    setFocused(false);
    onSubmit(q);
  };

  return (
    <div className="relative max-w-[520px]">
      <div className="flex items-center gap-3 rounded-xl border border-border bg-background px-4 py-3.5 transition-colors focus-within:border-ring/55">
        <SearchIcon className="size-[18px] shrink-0 text-muted-foreground" />
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={() => {
            if (blurTimer.current) clearTimeout(blurTimer.current);
            setFocused(true);
          }}
          onBlur={() => {
            blurTimer.current = setTimeout(() => setFocused(false), 120);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
            if (e.key === "Escape") setFocused(false);
          }}
          type="text"
          placeholder="Tanya atau cari topik…"
          className="min-w-0 flex-1 bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted-foreground"
        />
        {value ? (
          <button
            type="button"
            onClick={() => {
              setDraft("");
              onSubmit("");
            }}
            aria-label="Hapus pencarian"
            className="shrink-0 rounded-full p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <XIcon className="size-3.5" />
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => submit()}
          aria-label="Cari"
          className="shrink-0 rounded-md border border-border bg-secondary px-2 py-0.5 font-mono text-[11px] text-muted-foreground transition-colors hover:border-primary hover:text-primary"
        >
          ↵
        </button>
      </div>

      {open ? (
        <div className="absolute z-20 mt-2 w-full rounded-2xl border border-border bg-card p-1.5 shadow-md">
          <p className="px-2 py-1 font-mono text-[10px] tracking-wide text-muted-foreground">Saran pencarian</p>
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => submit(s)}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-secondary"
            >
              <SearchIcon className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate text-[13.5px] text-foreground">{s}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
