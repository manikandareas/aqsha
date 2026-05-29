import type { ReactNode } from "react";
import type { ArtifactId, StorageId, WorkspaceId } from "@/lib/convex-refs";
import type {
  RateStatus,
  ResearchArtifact,
  ResearchRun,
  ResearchSource,
  SendResult,
  MessageContextArtifactMetadata,
} from "../types";

export type { ArtifactId, WorkspaceId };

export type ThreadSummary = {
  threadId: string;
  workspaceId?: string;
  title: string;
  createdAt: number;
  lastActivityAt: number;
  lastMessagePreview: string;
  messageCount: number;
  status: "idle" | "streaming" | "failed";
};

export type ViewerSummary =
  | {
      name: string | null;
      email: string | null;
      image: string | null;
    }
  | undefined;

export type StartThread = (args: {
  content: string;
  mode: "normal" | "deep";
  commandId?: string;
  workspaceId?: WorkspaceId;
  selectedContextArtifactIds?: ArtifactId[];
  messageAttachmentArtifactIds?: ArtifactId[];
  pendingAttachments?: Array<{
    storageId: StorageId;
    fileName: string;
    mimeType: string;
    size: number;
  }>;
  contextArtifactSnapshot?: MessageContextArtifactMetadata[];
}) => Promise<SendResult>;

export type SendMessage = (args: {
  threadId: string;
  content: string;
  mode: "normal" | "deep";
  commandId?: string;
  selectedContextArtifactIds?: ArtifactId[];
  messageAttachmentArtifactIds?: ArtifactId[];
  contextArtifactSnapshot?: MessageContextArtifactMetadata[];
}) => Promise<SendResult>;

export type ContextCandidateArtifact = {
  _id: ArtifactId;
  workspaceId?: string;
  artifactType?: string;
  title: string;
  plainTextPreview?: string;
  updatedAt: number;
};

export type SelectedContextArtifact = {
  artifactId: ArtifactId;
  artifact: {
    title: string;
    artifactType?: string;
    plainTextPreview?: string;
    updatedAt: number;
  };
};

export type DraftContextArtifact = {
  artifactId: string;
  title: string;
};

export type ToggleThreadContextArtifact = (args: {
  threadId: string;
  artifactId: ArtifactId;
}) => Promise<{ ok: boolean; selected: boolean }>;

export type RemoveThread = (args: { threadId: string }) => Promise<{ ok: true }>;

export type ThreadShellLayoutProps = {
  viewer: ViewerSummary;
  threads: ThreadSummary[];
  selectedThreadId?: string;
  onCreateThread: () => void;
  onSelectThread?: (threadId: string) => void;
  title: string;
  threadId?: string;
  selectedThread:
    | {
        title: string;
        workspaceId?: string;
      }
    | null
    | undefined;
  workspaces?: Array<{ _id: string; name: string }>;
  createWorkspace?: (args: { name: string }) => Promise<unknown>;
  rateStatus: RateStatus | undefined;
  startThread: StartThread;
  sendMessage: SendMessage;
  runs: ResearchRun[];
  artifacts: ResearchArtifact[];
  sources: ResearchSource[];
  rightPanelOpen: boolean;
  onRightPanelOpenChange: (open: boolean) => void;
  onCancelRun: (runId: string) => Promise<unknown>;
  onDeleteThread?: () => Promise<void>;
  removeThread?: (args: { threadId: string }) => Promise<{ ok: true }>;
  sidePanel?: ReactNode;
  contextArtifacts?: DraftContextArtifact[];
  onRemoveContextArtifact?: (artifactId: string) => void;
};
