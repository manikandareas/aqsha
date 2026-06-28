"use client";

import { libraryArtifactGridClass } from "@/lib/library-grid";
import { ArtifactTile } from "./workspace-library-grid";
import type {
  MoveTargetOption,
  WorkspaceArtifact,
} from "../utils/workspace-library-model";

// Tab "Artifact" = output agent, yang sifatnya kronologis. Daripada grid statis
// seperti Pustaka, kita render sebagai linimasa yang dikelompokkan per hari —
// "Hari ini / Kemarin / 12 Maret" — biar terasa seperti jejak kerja agent.
export function WorkspaceArtifactTimeline({
  artifacts,
  workspaceId,
  workspaces,
  moveTargets,
  getArtifactSelected,
  onToggleArtifactContext,
  onOpenArtifact,
  onRenameArtifact,
  onDeleteArtifact,
  onMoveArtifact,
  onMoveArtifactToWorkspace,
}: {
  artifacts: WorkspaceArtifact[];
  workspaceId: string;
  workspaces: Array<{ _id: string; name: string }>;
  moveTargets: MoveTargetOption[];
  getArtifactSelected: (artifactId: string) => boolean;
  onToggleArtifactContext: (artifactId: string) => void;
  onOpenArtifact: (artifactId: string) => void;
  onRenameArtifact: (artifact: WorkspaceArtifact) => void;
  onDeleteArtifact: (artifact: WorkspaceArtifact) => void;
  onMoveArtifact: (artifactId: string, target: string) => Promise<void>;
  onMoveArtifactToWorkspace: (
    artifactId: string,
    targetWorkspaceId: string,
  ) => Promise<void>;
}) {
  const groups = groupArtifactsByDay(artifacts);

  return (
    <div className="flex flex-col gap-10">
      {groups.map((group) => (
        <section key={group.key} className="flex flex-col gap-5">
          <div className="flex items-center gap-3">
            <span className="size-1.5 shrink-0 rounded-full bg-primary/70" />
            <h3 className="shrink-0 text-[13px] font-semibold leading-none text-foreground">
              {group.label}
            </h3>
            <span className="shrink-0 text-[12px] font-medium leading-none text-muted-foreground">
              {group.items.length}
            </span>
            <div className="h-px min-w-0 flex-1 bg-border/60" />
          </div>
          <div className={libraryArtifactGridClass}>
            {group.items.map((artifact) => (
              <ArtifactTile
                key={artifact._id}
                refCallback={() => {}}
                artifact={artifact}
                workspaceId={workspaceId}
                moveTargets={moveTargets}
                workspaces={workspaces}
                isDragging={false}
                isSelected={getArtifactSelected(artifact._id)}
                onSelect={() => onToggleArtifactContext(artifact._id)}
                onOpen={() => onOpenArtifact(artifact._id)}
                onRename={() => onRenameArtifact(artifact)}
                onDelete={() => onDeleteArtifact(artifact)}
                onMove={(target) => void onMoveArtifact(artifact._id, target)}
                onMoveToWorkspace={(targetWorkspaceId) =>
                  void onMoveArtifactToWorkspace(artifact._id, targetWorkspaceId)
                }
                onDragStart={() => {}}
                onDragEnd={() => {}}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

type DayGroup = { key: number; label: string; items: WorkspaceArtifact[] };

function groupArtifactsByDay(artifacts: WorkspaceArtifact[]): DayGroup[] {
  const sorted = artifacts.toSorted((a, b) => b.createdAt - a.createdAt);
  const todayStart = startOfDay(Date.now());
  const groups: DayGroup[] = [];
  const byKey = new Map<number, DayGroup>();
  for (const artifact of sorted) {
    const key = startOfDay(artifact.createdAt);
    let group = byKey.get(key);
    if (!group) {
      group = { key, label: dayLabel(key, todayStart), items: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    group.items.push(artifact);
  }
  // `sorted` desc → tiap kunci hari muncul pertama secara desc, jadi grup sudah urut.
  return groups;
}

const MS_PER_DAY = 86_400_000;

function startOfDay(timestamp: number): number {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function dayLabel(dayStart: number, todayStart: number): string {
  const diffDays = Math.round((todayStart - dayStart) / MS_PER_DAY);
  if (diffDays <= 0) return "Hari ini";
  if (diffDays === 1) return "Kemarin";
  const date = new Date(dayStart);
  const sameYear = new Date(todayStart).getFullYear() === date.getFullYear();
  return date.toLocaleDateString(
    "id-ID",
    sameYear
      ? { day: "numeric", month: "long" }
      : { day: "numeric", month: "long", year: "numeric" },
  );
}
