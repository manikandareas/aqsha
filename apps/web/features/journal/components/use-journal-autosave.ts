"use client";

import { useQueryClient } from "@tanstack/react-query";
import * as React from "react";

import { saveJournalContent } from "@/features/journal/lib/api";
import type { JournalRecord } from "@/features/journal/lib/journals";
import { getEdenErrorCode } from "@/lib/eden-error";
import { replaceById } from "@/lib/react-query/cache";
import { queryKeys } from "@/lib/react-query/keys";
import { plateValueToPlainText } from "@/lib/text";

type AutosaveStatus = "saved" | "dirty" | "saving" | "error" | "conflict";

type JournalDraftSnapshot = {
  title: string;
  contentJson: JournalRecord["contentJson"];
  plainText: string;
};

type UseJournalAutosaveOptions = {
  journal: JournalRecord;
  debounceMs?: number;
};

type UseJournalAutosaveResult = {
  contentValue: JournalRecord["contentJson"];
  saveStatus: AutosaveStatus;
  saveStatusLabel: string;
  title: string;
  handleContentChange: (contentJson: JournalRecord["contentJson"]) => void;
  handleTitleChange: (title: string) => void;
};

function normalizeTitleForSave(title: string): string {
  return title.trim() || "Untitled";
}

function areSnapshotsEqual(
  left: JournalDraftSnapshot,
  right: JournalDraftSnapshot,
): boolean {
  return (
    left.title === right.title &&
    left.plainText === right.plainText &&
    JSON.stringify(left.contentJson) === JSON.stringify(right.contentJson)
  );
}

function createSnapshot(
  title: string,
  contentJson: JournalRecord["contentJson"],
): JournalDraftSnapshot {
  return {
    title,
    contentJson,
    plainText: plateValueToPlainText(contentJson),
  };
}

function getSaveStatusLabel(status: AutosaveStatus): string {
  switch (status) {
    case "saving":
      return "Saving...";
    case "dirty":
      return "Unsaved";
    case "error":
      return "Save failed";
    case "conflict":
      return "Conflict - reload required";
    case "saved":
    default:
      return "Saved";
  }
}

export function useJournalAutosave({
  journal,
  debounceMs = 3000,
}: UseJournalAutosaveOptions): UseJournalAutosaveResult {
  const initialContentValue = React.useMemo(
    () => journal.contentJson,
    [journal.contentJson],
  );
  const initialSnapshot = React.useMemo(
    () => createSnapshot(journal.title, initialContentValue),
    [initialContentValue, journal.title],
  );

  const queryClient = useQueryClient();
  const [title, setTitle] = React.useState(journal.title);
  const [saveStatus, setSaveStatus] =
    React.useState<AutosaveStatus>("saved");

  const baseUpdatedAtRef = React.useRef(journal.updatedAt);
  const contentValueRef =
    React.useRef<JournalRecord["contentJson"]>(initialContentValue);
  const titleRef = React.useRef(journal.title);
  const latestDraftRef = React.useRef<JournalDraftSnapshot>(initialSnapshot);
  const lastSavedDraftRef = React.useRef<JournalDraftSnapshot>(initialSnapshot);
  const queuedDraftRef = React.useRef<JournalDraftSnapshot | null>(null);
  const debounceTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const isSavingRef = React.useRef(false);
  const isConflictRef = React.useRef(false);
  const hasHandledContentChangeRef = React.useRef(false);

  const clearDebounceTimer = React.useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
  }, []);

  const saveDraft = React.useCallback(
    async (draft: JournalDraftSnapshot): Promise<void> => {
      if (isConflictRef.current) return;

      if (isSavingRef.current) {
        queuedDraftRef.current = draft;
        return;
      }

      queuedDraftRef.current = null;
      isSavingRef.current = true;
      setSaveStatus("saving");

      let activeDraft = draft;

      try {
        let draftToSave: JournalDraftSnapshot | null = draft;

        while (draftToSave) {
          if (areSnapshotsEqual(draftToSave, lastSavedDraftRef.current)) {
            draftToSave = queuedDraftRef.current;
            queuedDraftRef.current = null;
            continue;
          }

          const currentDraft = draftToSave;
          activeDraft = currentDraft;
          let savedJournal: JournalRecord;

          try {
            savedJournal = await saveJournalContent(journal.id, {
              baseUpdatedAt: baseUpdatedAtRef.current,
              title: normalizeTitleForSave(currentDraft.title),
              contentJson: currentDraft.contentJson,
              plainText: currentDraft.plainText,
            });
          } catch (cause) {
            if (getEdenErrorCode(cause) === "stale_journal_save") {
              isConflictRef.current = true;
              queuedDraftRef.current = null;
              clearDebounceTimer();
              setSaveStatus("conflict");
              return;
            }

            queuedDraftRef.current ??= currentDraft;
            setSaveStatus("error");
            return;
          }
          baseUpdatedAtRef.current = savedJournal.updatedAt;
          lastSavedDraftRef.current = currentDraft;
          queryClient.setQueryData<JournalRecord[]>(
            queryKeys.journals.list(),
            (currentJournals) => replaceById(savedJournal, currentJournals),
          );

          draftToSave = queuedDraftRef.current;
          queuedDraftRef.current = null;
        }

        if (
          !areSnapshotsEqual(latestDraftRef.current, lastSavedDraftRef.current)
        ) {
          setSaveStatus("dirty");
        } else {
          setSaveStatus("saved");
        }
      } catch {
        queuedDraftRef.current ??= activeDraft;
        setSaveStatus("error");
      } finally {
        isSavingRef.current = false;
      }
    },
    [clearDebounceTimer, journal.id, queryClient],
  );

  const scheduleSave = React.useCallback(
    (draft: JournalDraftSnapshot) => {
      latestDraftRef.current = draft;

      if (isConflictRef.current) return;

      clearDebounceTimer();

      if (areSnapshotsEqual(draft, lastSavedDraftRef.current)) {
        setSaveStatus(isSavingRef.current ? "saving" : "saved");
        return;
      }

      setSaveStatus(isSavingRef.current ? "saving" : "dirty");

      debounceTimerRef.current = setTimeout(() => {
        debounceTimerRef.current = null;
        void saveDraft(latestDraftRef.current);
      }, debounceMs);
    },
    [clearDebounceTimer, debounceMs, saveDraft],
  );

  const handleTitleChange = React.useCallback(
    (nextTitle: string) => {
      titleRef.current = nextTitle;
      setTitle(nextTitle);
      scheduleSave(createSnapshot(nextTitle, contentValueRef.current));
    },
    [scheduleSave],
  );

  const handleContentChange = React.useCallback(
    (contentJson: JournalRecord["contentJson"]) => {
      const draft = createSnapshot(titleRef.current, contentJson);

      contentValueRef.current = contentJson;

      if (!hasHandledContentChangeRef.current) {
        hasHandledContentChangeRef.current = true;

        if (
          draft.title === lastSavedDraftRef.current.title &&
          draft.plainText === lastSavedDraftRef.current.plainText
        ) {
          latestDraftRef.current = draft;
          lastSavedDraftRef.current = draft;
          return;
        }
      }

      scheduleSave(draft);
    },
    [scheduleSave],
  );

  React.useEffect(() => {
    function handleBeforeUnload(event: BeforeUnloadEvent): void {
      const hasPendingSave =
        isSavingRef.current ||
        Boolean(queuedDraftRef.current) ||
        Boolean(debounceTimerRef.current) ||
        !areSnapshotsEqual(latestDraftRef.current, lastSavedDraftRef.current);

      if (!hasPendingSave) return;

      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, []);

  React.useEffect(() => {
    return () => {
      clearDebounceTimer();
    };
  }, [clearDebounceTimer]);

  return {
    contentValue: initialContentValue,
    saveStatus,
    saveStatusLabel: getSaveStatusLabel(saveStatus),
    title,
    handleContentChange,
    handleTitleChange,
  };
}
