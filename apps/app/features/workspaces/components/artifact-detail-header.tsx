"use client";

import { ChevronRightIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { panelHeaderPaddingClass } from "@/lib/panel-surface";
import { cn } from "@/lib/utils";

export function ArtifactDetailHeader({
  workspaceId,
  workspaceName,
  artifactTitle,
  trailing,
}: {
  workspaceId: string;
  workspaceName: string;
  artifactTitle: string;
  trailing?: ReactNode;
}) {
  return (
    <header
      className={cn(
        "flex shrink-0 flex-col gap-3 border-border bg-background",
        panelHeaderPaddingClass,
      )}
    >
      <div className="flex min-w-0 items-center justify-between gap-3">
        <h1 className="truncate font-heading text-lg font-semibold leading-tight tracking-tight text-foreground sm:text-xl">
          {workspaceName}
        </h1>
        {trailing ? <div className="flex shrink-0 items-center gap-1">{trailing}</div> : null}
      </div>
      <nav
        aria-label="Lokasi artifact"
        className="flex min-w-0 items-center gap-1 text-[12px] font-medium text-muted-foreground"
      >
        <Link href={`/workspaces/${workspaceId}`} className="truncate hover:text-foreground">
          {workspaceName}
        </Link>
        <ChevronRightIcon className="size-3 shrink-0" />
        <span className="truncate font-semibold text-foreground">{artifactTitle}</span>
      </nav>
    </header>
  );
}
