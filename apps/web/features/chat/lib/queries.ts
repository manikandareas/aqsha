"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createChatThread,
  deleteChatThread,
  listChatThreads,
} from "@/features/chat/lib/api";
import type { ChatThread } from "@/features/chat/lib/types";
import { prependUniqueById, removeById } from "@/lib/react-query/cache";
import { queryKeys } from "@/lib/react-query/keys";

export function useChatThreadsQuery() {
  return useQuery({
    queryKey: queryKeys.chat.threads(),
    queryFn: listChatThreads,
  });
}

export function useCreateChatThreadMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createChatThread,
    onSuccess: (thread) => {
      queryClient.setQueryData<ChatThread[]>(
        queryKeys.chat.threads(),
        (currentThreads) => prependUniqueById(thread, currentThreads),
      );
    },
  });
}

export function useDeleteChatThreadMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteChatThread,
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.chat.threads() });
      const previousThreads = queryClient.getQueryData<ChatThread[]>(
        queryKeys.chat.threads(),
      );

      queryClient.setQueryData<ChatThread[]>(
        queryKeys.chat.threads(),
        (currentThreads) => removeById(id, currentThreads),
      );

      return { previousThreads };
    },
    onError: (_error, _id, context) => {
      if (context?.previousThreads) {
        queryClient.setQueryData(
          queryKeys.chat.threads(),
          context.previousThreads,
        );
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.chat.threads(),
      });
    },
  });
}
