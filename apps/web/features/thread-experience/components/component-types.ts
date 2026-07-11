import type { ReactNode } from "react";
import type { ArtifactId, WorkspaceId } from "@/lib/convex-refs";
import type { RateStatus } from "../types";

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
  lastAgentKind?: "lite" | "pro";
  pinnedAt?: number | null; // null/absen = tak disematkan; nilai ⇒ grup "Disematkan" (urut DESC)
  bucket?: "recent" | "older"; // dihitung BE (ThreadService.list) untuk grouping sidebar
};

export type ViewerSummary =
  | {
      name: string | null;
      email: string | null;
      image: string | null;
    }
  | undefined;

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

export type ToggleThreadContextArtifact = (args: {
  threadId: string;
  artifactId: ArtifactId;
}) => Promise<{ ok: boolean; selected: boolean }>;

export type RemoveThread = (args: { threadId: string }) => Promise<{ ok: boolean }>;

export type TogglePinThread = (args: {
  threadId: string;
  pinned: boolean;
}) => Promise<{ ok: boolean }>;

export type ThreadShellLayoutProps = {
  threads: ThreadSummary[];
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
  rateStatus: RateStatus | undefined;
  rightPanelOpen: boolean;
  onRightPanelOpenChange: (open: boolean) => void;
  onDeleteThread?: () => Promise<void>;
  sidePanel?: ReactNode;
};
