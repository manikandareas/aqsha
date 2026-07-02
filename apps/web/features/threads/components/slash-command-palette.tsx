"use client";

import type { PromptCommand, PromptCommandId } from "@aqsha/chat-core";
import {
  BookOpenIcon,
  CheckCircle2Icon,
  ExpandParagraphIcon,
  FileTextIcon,
  FlagIcon,
  FolderIcon,
  GitBranchIcon,
  HelpCircleIcon,
  LayoutGridIcon,
  Library,
  MessageSquareIcon,
  NotebookIcon,
  PencilIcon,
  PenLineIcon,
  Quote,
  RotateCcwIcon,
  Scale,
  SearchIcon,
  ShieldCheckIcon,
  ShieldIcon,
  SparklesIcon,
  TableIcon,
  TelescopeIcon,
  TrendingUpIcon,
  WrenchIcon,
} from "@aqsha/ui/icons";
import type { ComponentType } from "react";
import {
  ComposerPopoverEmpty,
  ComposerPopoverGroup,
  ComposerPopoverHeader,
  ComposerPopoverItem,
  ComposerPopoverList,
  ComposerPopoverShell,
} from "./composer-popover";

const promptCommandGroups = [
  "Metodologi",
  "Penulisan Bab",
  "Literatur",
  "Bahasa & Sitasi",
  "Pertahanan",
  "Workspace",
] as const;

const promptCommandIconMap: Record<PromptCommandId, ComponentType<{ className?: string }>> = {
  kuantitatif: TrendingUpIcon,
  kualitatif: MessageSquareIcon,
  campuran: GitBranchIcon,
  rnd: WrenchIcon,
  latarbelakang: FileTextIcon,
  rumusanmasalah: HelpCircleIcon,
  tujuan: FlagIcon,
  hipotesis: Scale,
  kerangka: LayoutGridIcon,
  pembahasan: PenLineIcon,
  kesimpulan: CheckCircle2Icon,
  abstrak: BookOpenIcon,
  gap: SearchIcon,
  matriks: TableIcon,
  terdahulu: Library,
  deep: TelescopeIcon,
  akademik: SparklesIcon,
  puebi: ShieldCheckIcon,
  sitasi: Quote,
  parafrase: RotateCcwIcon,
  expand: ExpandParagraphIcon,
  summarize: FileTextIcon,
  sidang: ShieldIcon,
  reviewer: PencilIcon,
  artifact: NotebookIcon,
  workspace: FolderIcon,
};

export function SlashCommandPalette({
  commands,
  highlightedIndex,
  onHighlight,
  onSelect,
}: {
  commands: PromptCommand[];
  highlightedIndex: number;
  onHighlight: (index: number) => void;
  onSelect: (command: PromptCommand) => void;
}) {
  let flatIndex = 0;

  return (
    <ComposerPopoverShell>
      <ComposerPopoverHeader title="Perintah" count={commands.length} />
      <ComposerPopoverList id="composer-slash-commands">
        {commands.length === 0 ? (
          <ComposerPopoverEmpty
            title="Tidak ada perintah yang cocok"
            hint={
              <>
                Coba kata kunci lain, mis. <span className="font-mono">kuantitatif</span> atau{" "}
                <span className="font-mono">matriks</span>.
              </>
            }
          />
        ) : (
          promptCommandGroups.map((group) => {
            const groupCommands = commands.filter((item) => item.group === group);
            if (groupCommands.length === 0) {
              return null;
            }
            const startIndex = flatIndex;
            flatIndex += groupCommands.length;
            return (
              <ComposerPopoverGroup key={group} label={group}>
                {groupCommands.map((item, index) => {
                  const itemIndex = startIndex + index;
                  const ItemIcon =
                    promptCommandIconMap[item.id as PromptCommandId] ?? LayoutGridIcon;
                  return (
                    <ComposerPopoverItem
                      key={item.id}
                      value={item.id}
                      icon={ItemIcon}
                      title={item.label}
                      description={item.description}
                      active={itemIndex === highlightedIndex}
                      onSelect={() => onSelect(item)}
                      onMouseEnter={() => onHighlight(itemIndex)}
                      meta={
                        <span className="font-mono text-[10.5px] text-muted-foreground/70">
                          {item.slug}
                        </span>
                      }
                    />
                  );
                })}
              </ComposerPopoverGroup>
            );
          })
        )}
      </ComposerPopoverList>
    </ComposerPopoverShell>
  );
}
