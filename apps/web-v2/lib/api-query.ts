/**
 * Konvensi data web-v2: query keys terpusat + `unwrap()` untuk Eden Treaty.
 *
 * Eden mengembalikan `{ data, error }` (tak pernah throw). TanStack Query butuh
 * throw agar masuk state error → `unwrap` melempar `error` (bentuk `{ status, value }`)
 * yang dibaca `readableApiErrorMessage(error, fallback)` di komponen.
 */

export function unwrap<T>(res: { data: T | null; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data as T;
}

export const queryKeys = {
  workspaces: {
    all: ["workspaces"] as const,
    list: (params: { includeArchived: boolean }) => ["workspaces", "list", params] as const,
    detail: (id: string) => ["workspaces", "detail", id] as const,
  },
  folders: {
    list: (workspaceId: string) => ["folders", "list", workspaceId] as const,
  },
  artifacts: {
    all: ["artifacts"] as const,
    list: (workspaceId: string, folderId: string | null) =>
      ["artifacts", "list", workspaceId, folderId] as const,
    detail: (id: string) => ["artifacts", "detail", id] as const,
    render: (id: string) => ["artifacts", "render", id] as const,
  },
  feed: {
    all: ["feed"] as const,
    list: (params: { mode: string; topic: string | null }) =>
      ["feed", "list", params] as const,
    search: (params: { q: string; fromYear: number | null }) =>
      ["feed", "search", params] as const,
    item: (id: string) => ["feed", "item", id] as const,
  },
  papers: {
    detail: (key: string) => ["papers", "detail", key] as const,
    search: (params: { query: string; fromYear: number | null }) =>
      ["papers", "search", params] as const,
  },
  billing: {
    all: ["billing"] as const,
    current: () => ["billing", "current"] as const,
    plans: () => ["billing", "plans"] as const,
    usage: (days: number) => ["billing", "usage", days] as const,
  },
  threads: {
    all: ["threads"] as const,
    list: () => ["threads", "list"] as const,
    detail: (id: string) => ["threads", "detail", id] as const,
    messages: (id: string) => ["threads", "messages", id] as const,
  },
  user: {
    me: () => ["user", "me"] as const,
  },
};
