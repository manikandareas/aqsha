"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * Notion-style document title: a large, flush, editable heading that sits above
 * the BlockNote body. Seeds its value once and stays the local source of truth,
 * so autosave round-trips never yank the cursor (same model as the body editor).
 * Autosaves the trimmed title via `onRename`, debounced, and flushes on blur.
 */
export function DocumentTitleEditor({
  initialTitle,
  onRename,
}: {
  initialTitle: string;
  onRename: (title: string) => Promise<unknown>;
}) {
  const [value, setValue] = useState(initialTitle);
  const lastSavedRef = useRef<string | null>(null);
  if (lastSavedRef.current === null) {
    lastSavedRef.current = initialTitle.trim();
  }
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const onRenameRef = useRef(onRename);
  useLayoutEffect(() => {
    onRenameRef.current = onRename;
  });

  const autosize = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };

  useLayoutEffect(() => {
    autosize();
  }, [value]);

  const save = (next: string) => {
    const trimmed = next.trim();
    if (!trimmed || trimmed === lastSavedRef.current) return;
    lastSavedRef.current = trimmed;
    void onRenameRef.current(trimmed);
  };

  useEffect(() => {
    const trimmed = value.trim();
    if (!trimmed || trimmed === lastSavedRef.current) return;
    const timeout = window.setTimeout(() => {
      const t = value.trim();
      if (!t || t === lastSavedRef.current) return;
      lastSavedRef.current = t;
      void onRenameRef.current(t);
    }, 700);
    return () => window.clearTimeout(timeout);
  }, [value]);

  return (
    <textarea
      ref={textareaRef}
      rows={1}
      value={value}
      aria-label="Document title"
      placeholder="Untitled"
      spellCheck={false}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => save(value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          save(value);
          event.currentTarget.blur();
        }
      }}
      className="w-full resize-none overflow-hidden border-0 bg-transparent px-5 pb-1 pt-2 text-[2rem] font-bold leading-[1.15] tracking-tight text-foreground outline-none placeholder:text-muted-foreground/35 sm:text-[2.25rem]"
    />
  );
}
