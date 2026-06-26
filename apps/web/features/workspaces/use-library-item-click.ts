"use client";

import { useEffect, useRef, type RefObject } from "react";

const CLICK_DELAY_MS = 250;

function clearClickTimer(
  clickTimerRef: RefObject<ReturnType<typeof setTimeout> | null>,
) {
  if (clickTimerRef.current) {
    clearTimeout(clickTimerRef.current);
    clickTimerRef.current = null;
  }
}

export function useLibraryItemClick({
  onSingleClick,
  onDoubleClick,
}: {
  onSingleClick: () => void;
  onDoubleClick: () => void;
}) {
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => clearClickTimer(clickTimerRef);
  }, []);

  const selectLibraryItem = () => {
    clearClickTimer(clickTimerRef);
    clickTimerRef.current = setTimeout(() => {
      onSingleClick();
      clickTimerRef.current = null;
    }, CLICK_DELAY_MS);
  };

  const openLibraryItem = () => {
    clearClickTimer(clickTimerRef);
    onDoubleClick();
  };

  return { selectLibraryItem, openLibraryItem };
}
