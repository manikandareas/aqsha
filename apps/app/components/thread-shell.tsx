"use client";

import { useMutation, useQuery } from "convex/react";
import { Loader2Icon, SendHorizontalIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@aqsha/convex/api";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";

export function ThreadShell({ threadId }: { threadId?: string }) {
  const router = useRouter();
  const viewer = useQuery(api.auth.getCurrentUser);
  const threadPage = useQuery(api.threads.list, {
    paginationOpts: { cursor: null, numItems: 50 },
  });
  const selectedThread = useQuery(
    api.threads.get,
    threadId ? { threadId } : "skip",
  );
  const createThread = useMutation(api.threads.create);
  const [isCreating, setIsCreating] = useState(false);

  const threads = threadPage?.page ?? [];
  const title = threadId
    ? selectedThread?.title ?? "Thread tidak ditemukan"
    : "Thread baru";

  const handleCreateThread = async () => {
    setIsCreating(true);
    try {
      const result = await createThread({});
      router.push(`/thread/${result.threadId}`);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <SidebarProvider>
      <AppSidebar
        viewer={viewer}
        threads={threads}
        selectedThreadId={threadId}
        isCreating={isCreating}
        onCreateThread={handleCreateThread}
      />
      <SidebarInset className="bg-background">
        <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b bg-card/80 px-4 backdrop-blur">
          <div className="flex min-w-0 items-center gap-2">
            <SidebarTrigger className="-ml-1" />
            <Separator
              orientation="vertical"
              className="mr-2 data-vertical:h-4 data-vertical:self-auto"
            />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbPage className="max-w-[48vw] truncate font-medium sm:max-w-[520px]">
                    {title}
                  </BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
          <ThemeToggle />
        </header>

        <main className="flex min-h-[calc(100svh-4rem)] flex-col">
          <section className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-5 py-8 sm:px-8">
            {threadId && selectedThread === null ? (
              <AccessDeniedState />
            ) : (
              <EmptyThreadState
                isLoading={threadId ? selectedThread === undefined : false}
                title={threadId ? selectedThread?.title : undefined}
              />
            )}
          </section>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}

function EmptyThreadState({
  isLoading,
  title,
}: {
  isLoading: boolean;
  title?: string;
}) {
  return (
    <div className="flex flex-1 flex-col justify-between gap-8">
      <div className="mx-auto grid w-full max-w-2xl flex-1 place-items-center py-10 text-center">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Loader2Icon className="size-4 animate-spin" />
            Loading thread...
          </div>
        ) : (
          <div className="grid gap-5">
            <p className="font-hand text-2xl text-[var(--lavender)]">
              quiet desk, clear sources
            </p>
            <div className="grid gap-3">
              <h1 className="font-heading text-3xl font-bold leading-tight sm:text-[32px]">
                {title ?? "Mulai riset dari satu pertanyaan."}
              </h1>
              <p className="mx-auto max-w-xl text-[15px] leading-7 text-muted-foreground">
                Tempat tenang untuk menyusun pertanyaan, membaca kembali konteks,
                dan menjaga riset tetap rapi.
              </p>
            </div>
          </div>
        )}
      </div>
      <ComposerSkeleton />
    </div>
  );
}

function AccessDeniedState() {
  return (
    <div className="flex flex-1 flex-col justify-between gap-8">
      <div className="mx-auto grid w-full max-w-xl flex-1 place-items-center py-10 text-center">
        <div className="grid gap-3">
          <h1 className="font-heading text-3xl font-bold leading-tight">
            Thread tidak tersedia.
          </h1>
          <p className="text-[15px] leading-7 text-muted-foreground">
            Thread ini tidak ditemukan untuk akun yang sedang masuk.
          </p>
        </div>
      </div>
      <ComposerSkeleton />
    </div>
  );
}

function ComposerSkeleton() {
  return (
    <div className="sticky bottom-4 rounded-[14px] border bg-card p-3 shadow-aqsha">
      <textarea
        disabled
        rows={3}
        placeholder="Tulis pertanyaan riset..."
        className="min-h-24 w-full resize-none rounded-[10px] border border-input bg-transparent px-3 py-3 text-[15px] leading-6 outline-none placeholder:text-muted-foreground"
      />
      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="inline-flex rounded-full border bg-muted p-1 text-xs font-semibold">
          <span className="rounded-full bg-card px-3 py-1 text-foreground">
            Normal
          </span>
          <span className="px-3 py-1 text-[var(--lavender)]">Deep</span>
        </div>
        <Button type="button" disabled>
          <SendHorizontalIcon className="size-4" />
          Send
        </Button>
      </div>
    </div>
  );
}
