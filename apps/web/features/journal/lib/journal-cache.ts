import type { QueryClient } from "@tanstack/react-query"

import type { JournalRecord } from "./journals"


export function syncJournalToCaches(
  queryClient: QueryClient,
  journal: JournalRecord,
) {
  queryClient.setQueryData(journalDetailQueryKey(journal.id), journal)
  queryClient.setQueryData<JournalRecord[] | undefined>(
    activeJournalsQueryKey,
    (current) => {
      if (!current) {
        return [journal]
      }

      const next = current.filter((item) => item.id !== journal.id)
      return [journal, ...next]
    },
  )
  queryClient.setQueryData<JournalRecord[] | undefined>(
    recentJournalsQueryKey(),
    (current) => {
      if (!current) {
        return [journal]
      }

      const next = current.filter((item) => item.id !== journal.id)
      return [journal, ...next].slice(0, 5)
    },
  )
}
