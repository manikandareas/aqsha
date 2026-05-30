"use client";

import { ChevronRightIcon, PencilIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function ArtifactDetailHeader({
  workspaceId,
  workspaceName,
  artifactTitle,
  onRename,
  trailing,
}: {
  workspaceId: string;
  workspaceName: string;
  artifactTitle: string;
  onRename: () => void;
  trailing?: ReactNode;
}) {
  return (
    <header className="shrink-0 bg-background px-5 pb-6 pt-4 sm:px-7 sm:pb-7 sm:pt-5">
      <div className="flex min-w-0 items-start justify-between gap-4">
        <div className="grid min-w-0 gap-2.5">
          <div className="flex min-w-0 items-start gap-2.5">
            <h1 className="min-w-0 truncate font-heading text-lg font-semibold leading-tight tracking-tight text-foreground sm:text-xl">
              {artifactTitle}
            </h1>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Rename artifact"
                    className="size-7 shrink-0 rounded-full text-muted-foreground hover:text-foreground active:scale-[0.98]"
                    onClick={onRename}
                  >
                    <PencilIcon className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Rename artifact</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
        {trailing ? <div className="flex shrink-0 items-center gap-1 pt-1">{trailing}</div> : null}
      </div>
      <nav
        aria-label="Lokasi artifact"
        className={cn(
          "mt-4 flex min-w-0 items-center gap-1 text-[11px] font-medium text-muted-foreground",
          "sm:mt-5",
        )}
      >
        <Link href={`/app/workspaces/${workspaceId}`} className="truncate hover:text-foreground">
          {workspaceName}
        </Link>
        <ChevronRightIcon className="size-3 shrink-0" />
        <span className="truncate font-semibold text-foreground">{artifactTitle}</span>
      </nav>
    </header>
  );
}
