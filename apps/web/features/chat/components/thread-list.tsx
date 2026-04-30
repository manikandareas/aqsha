"use client";

import { PlusIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createChatThread } from "@/features/chat/lib/api";
import { dispatchThreadsChanged } from "@/features/chat/lib/events";
import type { ChatThread } from "@/features/chat/lib/types";

const threadDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

function formatDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Temporary";
  }

  return threadDateFormatter.format(date);
}

export function ThreadList({ threads }: { threads: ChatThread[] }) {
  const router = useRouter();
  const [isCreating, setIsCreating] = useState(false);

  async function handleCreateThread() {
    setIsCreating(true);

    try {
      const thread = await createChatThread();
      dispatchThreadsChanged();
      router.push(`/app/threads/${thread.id}`);
      router.refresh();
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-10 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <p className="w-fit rounded-full bg-badge-bg px-2 py-1 text-xs font-semibold tracking-badge text-badge-foreground">
            Temporary threads
          </p>
          <div>
            <h1 className="text-3xl font-bold tracking-[-0.625px] text-foreground">
              Threads
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
              Start a lightweight AI conversation. Threads are kept in memory for this API process and will be wired to durable storage later.
            </p>
          </div>
        </div>
        <Button onClick={handleCreateThread} disabled={isCreating}>
          <PlusIcon className="size-4" />
          {isCreating ? "Creating..." : "New chat"}
        </Button>
      </div>

      {threads.length === 0 ? (
        <Card className="border-dashed py-10 text-center shadow-sm">
          <CardHeader>
            <CardTitle>No threads yet</CardTitle>
            <CardDescription>
              Create your first temporary chat thread to start streaming with the assistant.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={handleCreateThread} disabled={isCreating}>
              <PlusIcon className="size-4" />
              {isCreating ? "Creating..." : "New chat"}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {threads.map((thread) => (
            <Link key={thread.id} href={`/app/threads/${thread.id}`}>
              <Card className="transition-shadow hover:shadow-md">
                <CardHeader>
                  <CardTitle className="line-clamp-1">{thread.title}</CardTitle>
                  <CardDescription>
                    {formatDate(thread.updatedAt)}
                    {thread.model ? ` · ${thread.model}` : null}
                  </CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
