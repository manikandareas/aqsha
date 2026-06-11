"use client";

import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  ArrowLeftIcon,
  ChevronRightIcon,
  FileTextIcon,
  FolderIcon,
  Loader2Icon,
  SearchIcon,
} from "@aqsha/ui/icons";
import { cn } from "@/lib/utils";

export type MentionWorkspaceOption = {
  type: "workspace";
  workspaceId: string;
  name: string;
  emoji?: string;
  isAmbient?: boolean;
  /** Disabled because it is already pinned or the workspace cap is reached. */
  disabled?: boolean;
  disabledReason?: string;
};

export type MentionItemOption = {
  type: "item";
  workspaceId: string;
  workspaceName: string;
  artifactId: string;
  title: string;
  /** Disabled because it is already pinned or the paper cap is reached. */
  disabled?: boolean;
  disabledReason?: string;
};

export function ContextMentionPalette({
  mode,
  workspaceOptions,
  itemOptions,
  itemsLoading,
  drillWorkspaceName,
  highlightedIndex,
  capNotice,
  onHighlight,
  onSelectWorkspace,
  onDrillWorkspace,
  onSelectItem,
  onBack,
}: {
  mode: "workspace" | "item";
  workspaceOptions: MentionWorkspaceOption[];
  itemOptions: MentionItemOption[];
  itemsLoading?: boolean;
  drillWorkspaceName?: string;
  highlightedIndex: number;
  capNotice?: string | null;
  onHighlight: (index: number) => void;
  onSelectWorkspace: (option: MentionWorkspaceOption) => void;
  onDrillWorkspace: (option: MentionWorkspaceOption) => void;
  onSelectItem: (option: MentionItemOption) => void;
  onBack: () => void;
}) {
  const count = mode === "workspace" ? workspaceOptions.length : itemOptions.length;

  return (
    <Command shouldFilter={false} className="rounded-xl bg-popover p-0">
      <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3 pt-2.5 pb-2">
        <div className="flex min-w-0 items-center gap-1.5 text-[12px] font-semibold text-foreground">
          {mode === "item" ? (
            <button
              type="button"
              onClick={onBack}
              className="inline-flex size-5 items-center justify-center rounded-md bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
              aria-label="Kembali ke daftar workspace"
            >
              <ArrowLeftIcon className="size-3" />
            </button>
          ) : (
            <span className="inline-flex size-5 items-center justify-center rounded-md bg-muted text-muted-foreground">
              <SearchIcon className="size-3" />
            </span>
          )}
          <span className="truncate">
            {mode === "item" ? drillWorkspaceName ?? "Workspace" : "Konteks"}
          </span>
          {count > 0 ? (
            <span className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-muted px-1 text-[10px] font-semibold text-muted-foreground">
              {count}
            </span>
          ) : null}
        </div>
        <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
          <span className="inline-flex h-4 min-w-4 items-center justify-center rounded border border-border/70 bg-background px-1 font-mono text-[9.5px] font-medium leading-none text-foreground/80 shadow-[0_1px_0_0_var(--border)]">
            esc
          </span>
          tutup
        </span>
      </div>
      <CommandList id="composer-context-mentions" className="max-h-[19rem] px-1.5 py-1.5">
        {capNotice ? (
          <p className="px-2 py-1.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
            {capNotice}
          </p>
        ) : null}
        {mode === "workspace" ? (
          <WorkspaceSection
            options={workspaceOptions}
            highlightedIndex={highlightedIndex}
            onHighlight={onHighlight}
            onSelectWorkspace={onSelectWorkspace}
            onDrillWorkspace={onDrillWorkspace}
          />
        ) : (
          <ItemSection
            options={itemOptions}
            loading={itemsLoading}
            highlightedIndex={highlightedIndex}
            onHighlight={onHighlight}
            onSelectItem={onSelectItem}
          />
        )}
      </CommandList>
    </Command>
  );
}

function MentionEmpty({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5 px-3 py-6 text-center">
      <span className="inline-flex size-9 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <SearchIcon className="size-4" />
      </span>
      <p className="text-[12.5px] font-medium text-foreground">{label}</p>
    </div>
  );
}

function WorkspaceSection({
  options,
  highlightedIndex,
  onHighlight,
  onSelectWorkspace,
  onDrillWorkspace,
}: {
  options: MentionWorkspaceOption[];
  highlightedIndex: number;
  onHighlight: (index: number) => void;
  onSelectWorkspace: (option: MentionWorkspaceOption) => void;
  onDrillWorkspace: (option: MentionWorkspaceOption) => void;
}) {
  if (options.length === 0) {
    return <MentionEmpty label="Tidak ada workspace yang cocok" />;
  }
  return (
    <CommandGroup className="p-0 [&_[cmdk-group-heading]]:hidden">
      {options.map((option, index) => {
        const isHighlighted = index === highlightedIndex;
        return (
          <CommandItem
            key={option.workspaceId}
            value={option.workspaceId}
            disabled={option.disabled}
            onSelect={() => {
              if (option.disabled) {
                return;
              }
              onSelectWorkspace(option);
            }}
            onMouseEnter={() => onHighlight(index)}
            className={cn(
              "group/cmd relative flex items-center gap-2.5 rounded-lg px-2 py-2 text-[13px]",
              "data-[selected=true]:bg-transparent hover:bg-muted/60",
              isHighlighted && "bg-muted/60",
              option.disabled && "opacity-50",
            )}
          >
            <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-mint-soft text-mint-foreground">
              {option.emoji ? (
                <span className="text-[14px] leading-none">{option.emoji}</span>
              ) : (
                <FolderIcon className="size-3.5" />
              )}
            </span>
            <span className="flex min-w-0 flex-1 items-center gap-1.5">
              <span className="truncate font-semibold leading-4 text-foreground">
                @{option.name}
              </span>
              {option.isAmbient ? (
                <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[9.5px] font-semibold text-muted-foreground">
                  ruang ini
                </span>
              ) : null}
              {option.disabled && option.disabledReason ? (
                <span className="truncate text-[10.5px] text-muted-foreground">
                  · {option.disabledReason}
                </span>
              ) : null}
            </span>
            <button
              type="button"
              aria-label={`Lihat paper di ${option.name}`}
              onMouseDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onDrillWorkspace(option);
              }}
              className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <ChevronRightIcon className="size-3.5" />
            </button>
          </CommandItem>
        );
      })}
    </CommandGroup>
  );
}

function ItemSection({
  options,
  loading,
  highlightedIndex,
  onHighlight,
  onSelectItem,
}: {
  options: MentionItemOption[];
  loading?: boolean;
  highlightedIndex: number;
  onHighlight: (index: number) => void;
  onSelectItem: (option: MentionItemOption) => void;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 px-3 py-6 text-[12px] text-muted-foreground">
        <Loader2Icon className="size-3.5 animate-spin" />
        Memuat paper…
      </div>
    );
  }
  if (options.length === 0) {
    return <MentionEmpty label="Belum ada paper di workspace ini" />;
  }
  return (
    <CommandGroup className="p-0 [&_[cmdk-group-heading]]:hidden">
      {options.map((option, index) => {
        const isHighlighted = index === highlightedIndex;
        return (
          <CommandItem
            key={option.artifactId}
            value={option.artifactId}
            disabled={option.disabled}
            onSelect={() => {
              if (option.disabled) {
                return;
              }
              onSelectItem(option);
            }}
            onMouseEnter={() => onHighlight(index)}
            className={cn(
              "group/cmd relative flex items-center gap-2.5 rounded-lg px-2 py-2 text-[13px]",
              "data-[selected=true]:bg-transparent hover:bg-muted/60",
              isHighlighted && "bg-muted/60",
              option.disabled && "opacity-50",
            )}
          >
            <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-sky-soft text-sky-foreground">
              <FileTextIcon className="size-3.5" />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-medium leading-4 text-foreground">
                {option.title}
              </span>
              {option.disabled && option.disabledReason ? (
                <span className="truncate text-[10.5px] text-muted-foreground">
                  {option.disabledReason}
                </span>
              ) : null}
            </span>
          </CommandItem>
        );
      })}
    </CommandGroup>
  );
}
