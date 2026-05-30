"use client";

import { useEffect, useRef } from "react";

const CLICK_DELAY_MS = 250;

export function useLibraryItemClick({
  onSingleClick,
  onDoubleClick,
}: {
  onSingleClick: () => void;
  onDoubleClick: () => void;
}) {
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
    };
  }, []);

  const handleClick = () => {
    if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
    clickTimerRef.current = setTimeout(() => {
      onSingleClick();
      clickTimerRef.current = null;
    }, CLICK_DELAY_MS);
  };

  const handleDoubleClick = () => {
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
    }
    onDoubleClick();
  };

  return { handleClick, handleDoubleClick };
}
