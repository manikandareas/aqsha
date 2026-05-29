"use client";

import { useState } from "react";

export function useDraftField(savedValue: string | null | undefined) {
  const normalizedSaved = savedValue?.trim() ?? "";
  const [state, setState] = useState(() => ({
    saved: normalizedSaved,
    draft: normalizedSaved,
  }));

  const draft = state.saved === normalizedSaved ? state.draft : normalizedSaved;

  return {
    saved: normalizedSaved,
    draft,
    setDraft: (nextDraft: string) =>
      setState({ saved: normalizedSaved, draft: nextDraft }),
  };
}
