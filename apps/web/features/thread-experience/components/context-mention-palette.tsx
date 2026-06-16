"use client";

import {
  ChevronRightIcon,
  FileTextIcon,
  FolderIcon,
  Loader2Icon,
} from "@aqsha/ui/icons";
import {
  ComposerPopoverBadge,
  ComposerPopoverEmpty,
  ComposerPopoverGroup,
  ComposerPopoverHeader,
  ComposerPopoverItem,
  ComposerPopoverList,
  ComposerPopoverShell,
} from "./composer-popover";

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
    <ComposerPopoverShell>
      <ComposerPopoverHeader
        title={mode === "item" ? drillWorkspaceName ?? "Workspace" : "Konteks"}
        count={count}
        onBack={mode === "item" ? onBack : undefined}
        backLabel="Kembali ke daftar workspace"
      />
      <ComposerPopoverList id="composer-context-mentions">
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
      </ComposerPopoverList>
    </ComposerPopoverShell>
  );
}

function DisabledReason({ reason }: { reason: string }) {
  return (
    <span className="max-w-[7.5rem] truncate text-[10.5px] text-muted-foreground">
      {reason}
    </span>
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
    return <ComposerPopoverEmpty title="Tidak ada workspace yang cocok" />;
  }
  return (
    <ComposerPopoverGroup>
      {options.map((option, index) => (
        <ComposerPopoverItem
          key={option.workspaceId}
          value={option.workspaceId}
          emoji={option.emoji}
          icon={FolderIcon}
          title={option.name}
          active={index === highlightedIndex}
          disabled={option.disabled}
          pinTrailing
          onSelect={() => onSelectWorkspace(option)}
          onMouseEnter={() => onHighlight(index)}
          meta={
            option.isAmbient ? (
              <ComposerPopoverBadge tone="muted">ruang ini</ComposerPopoverBadge>
            ) : option.disabled && option.disabledReason ? (
              <DisabledReason reason={option.disabledReason} />
            ) : null
          }
          trailing={
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
              className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <ChevronRightIcon className="size-3.5" />
            </button>
          }
        />
      ))}
    </ComposerPopoverGroup>
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
    return <ComposerPopoverEmpty title="Belum ada paper di workspace ini" />;
  }
  return (
    <ComposerPopoverGroup>
      {options.map((option, index) => (
        <ComposerPopoverItem
          key={option.artifactId}
          value={option.artifactId}
          icon={FileTextIcon}
          title={option.title}
          active={index === highlightedIndex}
          disabled={option.disabled}
          onSelect={() => onSelectItem(option)}
          onMouseEnter={() => onHighlight(index)}
          meta={
            option.disabled && option.disabledReason ? (
              <DisabledReason reason={option.disabledReason} />
            ) : null
          }
        />
      ))}
    </ComposerPopoverGroup>
  );
}
