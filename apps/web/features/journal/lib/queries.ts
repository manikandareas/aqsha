"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createJournal,
  deleteJournal,
  listJournals,
} from "@/features/journal/lib/api";
import type { JournalRecord } from "@/features/journal/lib/journals";
import { prependUniqueById, removeById } from "@/lib/react-query/cache";
import { queryKeys } from "@/lib/react-query/keys";

export function useJournalsQuery() {
  return useQuery({
    queryKey: queryKeys.journals.list(),
    queryFn: listJournals,
  });
}

export function useCreateJournalMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createJournal,
    onSuccess: (journal) => {
      queryClient.setQueryData<JournalRecord[]>(
        queryKeys.journals.list(),
        (currentJournals) => prependUniqueById(journal, currentJournals),
      );
    },
  });
}

export function useDeleteJournalMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteJournal,
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.journals.list() });
      const previousJournals = queryClient.getQueryData<JournalRecord[]>(
        queryKeys.journals.list(),
      );

      queryClient.setQueryData<JournalRecord[]>(
        queryKeys.journals.list(),
        (currentJournals) => removeById(id, currentJournals),
      );

      return { previousJournals };
    },
    onError: (_error, _id, context) => {
      if (context?.previousJournals) {
        queryClient.setQueryData(
          queryKeys.journals.list(),
          context.previousJournals,
        );
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.journals.list(),
      });
    },
  });
}
