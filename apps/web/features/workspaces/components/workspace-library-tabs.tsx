"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { WorkspaceLibraryTab } from "./workspace-library-surface";

// Tab editorial dengan underline yang muncul di bawah tab aktif + count inline.
// Pustaka = section utama (default); Artifact = output agent.
export function WorkspaceLibraryTabs({
  activeTab,
  onTabChange,
  libraryCount,
  artifactCount,
  controls,
}: {
  activeTab: WorkspaceLibraryTab;
  onTabChange: (tab: WorkspaceLibraryTab) => void;
  libraryCount: number;
  artifactCount: number;
  controls?: ReactNode;
}) {
  return (
    <div className="z-10 flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-border/70 bg-background px-5 sm:px-6">
      <div
        role="tablist"
        aria-label="Bagian workspace"
        className="flex items-center gap-5"
      >
        <Tab
          active={activeTab === "pustaka"}
          label="Pustaka"
          count={libraryCount}
          onClick={() => onTabChange("pustaka")}
        />
        <Tab
          active={activeTab === "artifact"}
          label="Artifact"
          count={artifactCount}
          // Dim saat kosong & belum dibuka — sinyal "belum ada", tapi tetap bisa diklik.
          dimmed={artifactCount === 0 && activeTab !== "artifact"}
          onClick={() => onTabChange("artifact")}
        />
      </div>
      {controls ? <div className="py-2">{controls}</div> : null}
    </div>
  );
}

function Tab({
  active,
  label,
  count,
  dimmed = false,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  dimmed?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "relative flex items-center gap-2 px-0.5 py-3.5 text-[14px] font-semibold leading-none outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        active
          ? "text-foreground"
          : dimmed
            ? "text-muted-foreground/45 hover:text-muted-foreground"
            : "text-muted-foreground hover:text-foreground",
      )}
    >
      <span>{label}</span>
      <span
        className={cn(
          "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums leading-none transition-colors",
          active ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
        )}
      >
        {count}
      </span>
      <span
        aria-hidden
        className={cn(
          "absolute inset-x-0 -bottom-px h-0.5 origin-left rounded-full bg-foreground transition-transform duration-200 ease-out",
          active ? "scale-x-100" : "scale-x-0",
        )}
      />
    </button>
  );
}
