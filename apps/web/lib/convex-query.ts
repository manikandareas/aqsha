"use client";

import {
  convexAction,
  convexQuery,
  ConvexQueryClient,
  useConvexAction,
  useConvexAuth,
  useConvexMutation,
} from "@convex-dev/react-query";
import {
  useMutation,
  useQuery,
  type UseMutationOptions,
  type QueryKey,
  type UseQueryResult,
} from "@tanstack/react-query";
import type {
  FunctionArgs,
  FunctionReference,
  FunctionReturnType,
} from "convex/server";

export { ConvexQueryClient, convexAction, convexQuery, useConvexAuth, useQuery };

export function useConvexQuery<
  ConvexQueryReference extends FunctionReference<"query">,
>(
  funcRef: ConvexQueryReference,
  ...argsOrSkip: unknown[]
) {
  const options = (convexQuery as unknown as (...args: unknown[]) => ReturnType<typeof convexQuery>)(
    funcRef,
    ...argsOrSkip,
  );
  return useQuery(options) as UseQueryResult<
    FunctionReturnType<ConvexQueryReference>,
    Error
  >;
}

export function useConvexActionQuery<
  ConvexActionReference extends FunctionReference<"action">,
>(
  funcRef: ConvexActionReference,
  ...argsOrSkip: unknown[]
) {
  const options = (convexAction as unknown as (...args: unknown[]) => ReturnType<typeof convexAction>)(
    funcRef,
    ...argsOrSkip,
  );
  return useQuery(options) as UseQueryResult<
    FunctionReturnType<ConvexActionReference>,
    Error
  >;
}

export function useConvexActionQueryWithKey<
  ConvexActionReference extends FunctionReference<"action">,
>(
  funcRef: ConvexActionReference,
  queryKey: QueryKey,
  argsOrSkip: FunctionArgs<ConvexActionReference> | "skip",
) {
  const actionFn = useConvexAction(funcRef);
  return useQuery({
    enabled: argsOrSkip !== "skip",
    queryFn: () =>
      actionFn(
        argsOrSkip as FunctionArgs<ConvexActionReference>,
      ) as Promise<FunctionReturnType<ConvexActionReference>>,
    queryKey,
    staleTime: Infinity,
  });
}

export function useConvexQueryData<
  ConvexQueryReference extends FunctionReference<"query">,
>(
  funcRef: ConvexQueryReference,
  ...argsOrSkip: unknown[]
) {
  return useConvexQuery(funcRef, ...argsOrSkip).data;
}

export function useConvexMutationState<
  ConvexMutationReference extends FunctionReference<"mutation">,
>(
  funcRef: ConvexMutationReference,
  options?: Omit<
    UseMutationOptions<
      FunctionReturnType<ConvexMutationReference>,
      Error,
      FunctionArgs<ConvexMutationReference>
    >,
    "mutationFn"
  >,
) {
  const mutationFn = useConvexMutation(funcRef);
  return useMutation({
    mutationFn: (variables) =>
      mutationFn(variables as FunctionArgs<ConvexMutationReference>),
    ...options,
  });
}

export function useConvexActionState<
  ConvexActionReference extends FunctionReference<"action">,
>(
  funcRef: ConvexActionReference,
  options?: Omit<
    UseMutationOptions<
      FunctionReturnType<ConvexActionReference>,
      Error,
      FunctionArgs<ConvexActionReference>
    >,
    "mutationFn"
  >,
) {
  const mutationFn = useConvexAction(funcRef);
  return useMutation({
    mutationFn: (variables) =>
      mutationFn(variables as FunctionArgs<ConvexActionReference>),
    ...options,
  });
}

export function useConvexMutationFn<
  ConvexMutationReference extends FunctionReference<"mutation">,
>(funcRef: ConvexMutationReference) {
  const mutation = useConvexMutationState(funcRef);
  return mutation.mutateAsync;
}

export function useConvexActionFn<
  ConvexActionReference extends FunctionReference<"action">,
>(funcRef: ConvexActionReference) {
  const mutation = useConvexActionState(funcRef);
  return mutation.mutateAsync;
}

export function useConvexOptimisticMutationState<
  ConvexMutationReference extends FunctionReference<"mutation">,
>(
  funcRef: ConvexMutationReference,
  optimisticUpdate: Parameters<
    ReturnType<typeof useConvexMutation<ConvexMutationReference>>["withOptimisticUpdate"]
  >[0],
  options?: Omit<
    UseMutationOptions<
      FunctionReturnType<ConvexMutationReference>,
      Error,
      FunctionArgs<ConvexMutationReference>
    >,
    "mutationFn"
  >,
) {
  const mutationFn = useConvexMutation(funcRef).withOptimisticUpdate(optimisticUpdate);
  return useMutation({
    mutationFn: (variables) =>
      mutationFn(variables as FunctionArgs<ConvexMutationReference>),
    ...options,
  });
}
