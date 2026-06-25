"use client";

import { Button } from "@aqsha/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@aqsha/ui/components/dropdown-menu";
import { ChevronDownIcon, MessageSquareIcon } from "@aqsha/ui/icons";
import { useRouter } from "next/navigation";
import { useThreadsList } from "../api";
import { threadTitle } from "../types";

/**
 * Switcher 4 percakapan terbaru (Slice 6.8) — pindah cepat antar thread dari header
 * ThreadView tanpa membuka sidebar. Sumber = halaman pertama `useThreadsList` (DESC
 * aktivitas), diiris 4. `activeId` di-skip supaya tak menampilkan thread yang sedang dibuka.
 */
export function ThreadRecentSwitcher({ activeId }: { activeId: string }) {
  const list = useThreadsList();
  const router = useRouter();
  const recent = (list.data?.pages[0]?.items ?? []).filter((t) => t.id !== activeId).slice(0, 4);

  if (recent.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="ghost" aria-label="Percakapan terbaru">
          <MessageSquareIcon />
          <ChevronDownIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        {recent.map((t) => (
          <DropdownMenuItem
            key={t.id}
            onSelect={() => router.push(`/app/threads/${t.id}`)}
            className="truncate"
          >
            {threadTitle(t)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
