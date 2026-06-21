"use client";

import { Button } from "@aqsha/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@aqsha/ui/components/dropdown-menu";
import { Loader2Icon, MoreHorizontalIcon, PencilIcon, PlusIcon } from "@aqsha/ui/icons";
import { cn } from "@aqsha/ui/lib/cn";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { ConfirmDialog, NameDialog } from "@/features/workspaces/components/common-dialogs";
import { useDeleteThread, useRenameThread, useThreadsList } from "../api";
import { type ChatThread, threadTitle } from "../types";

/** Sidebar daftar percakapan — buka baru + switch + ganti nama + hapus (Slice 6.1). */
export function ThreadSidebar() {
  const pathname = usePathname();
  const list = useThreadsList();
  const threads = list.data?.pages.flatMap((p) => p.items) ?? [];

  const [renaming, setRenaming] = useState<ChatThread | null>(null);
  const [deleting, setDeleting] = useState<ChatThread | null>(null);
  const rename = useRenameThread();
  const remove = useDeleteThread();
  const router = useRouter();

  return (
    <aside className="flex w-64 shrink-0 flex-col gap-2 border-r p-3">
      <Button asChild variant="outline" className="justify-start">
        <Link href="/app/threads">
          <PlusIcon />
          Percakapan baru
        </Link>
      </Button>

      <div className="mt-1 flex-1 space-y-0.5 overflow-y-auto">
        {list.isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
          </div>
        ) : threads.length === 0 ? (
          <p className="px-2 py-6 text-center text-muted-foreground text-xs">Belum ada percakapan.</p>
        ) : (
          threads.map((t) => {
            const active = pathname === `/app/threads/${t.id}`;
            return (
              <div
                key={t.id}
                className={cn(
                  "group flex items-center gap-1 rounded-md pr-1 hover:bg-muted/60",
                  active && "bg-muted",
                )}
              >
                <Link href={`/app/threads/${t.id}`} className="min-w-0 flex-1 px-2 py-1.5">
                  <p className="truncate text-sm">{threadTitle(t)}</p>
                  {t.lastMessagePreview ? (
                    <p className="truncate text-muted-foreground text-xs">{t.lastMessagePreview}</p>
                  ) : null}
                </Link>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-7 opacity-0 group-hover:opacity-100"
                      aria-label="Opsi percakapan"
                    >
                      <MoreHorizontalIcon />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => setRenaming(t)}>
                      <PencilIcon />
                      Ganti nama
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setDeleting(t)}>Hapus</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            );
          })
        )}
      </div>

      <NameDialog
        open={renaming !== null}
        onOpenChange={(o) => !o && setRenaming(null)}
        title="Ganti nama percakapan"
        label="Judul"
        initialValue={renaming ? threadTitle(renaming) : ""}
        pending={rename.isPending}
        onSubmit={(title) => {
          if (!renaming) return;
          rename.mutate({ id: renaming.id, title }, { onSuccess: () => setRenaming(null) });
        }}
      />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Hapus percakapan?"
        description="Percakapan dan seluruh pesannya akan dihapus permanen."
        confirmLabel="Hapus"
        destructive
        pending={remove.isPending}
        onConfirm={() => {
          if (!deleting) return;
          const id = deleting.id;
          remove.mutate(
            { id },
            {
              onSuccess: () => {
                setDeleting(null);
                if (pathname === `/app/threads/${id}`) router.push("/app/threads");
              },
            },
          );
        }}
      />
    </aside>
  );
}
