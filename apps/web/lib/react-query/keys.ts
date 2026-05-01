export const queryKeys = {
  chat: {
    all: ["chat"] as const,
    threads: () => ["chat", "threads"] as const,
    thread: (id: string) => ["chat", "threads", id] as const,
  },
  journals: {
    all: ["journals"] as const,
    list: () => ["journals", "list"] as const,
    detail: (id: string) => ["journals", "detail", id] as const,
  },
  session: {
    all: ["session"] as const,
  },
};
