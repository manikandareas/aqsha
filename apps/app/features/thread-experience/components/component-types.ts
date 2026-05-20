import type {
  RateStatus,
  ResearchArtifact,
  ResearchRun,
  ResearchSource,
  SendResult,
  SourceFocus,
} from "../types";

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

type WorkspaceId = string & { __tableName: "workspaces" };

export type StartThread = (args: {
  content: string;
  mode: "normal" | "deep";
  commandId?: string;
  workspaceId?: WorkspaceId;
}) => Promise<SendResult>;

export type SendMessage = (args: {
  threadId: string;
  content: string;
  mode: "normal" | "deep";
  commandId?: string;
}) => Promise<SendResult>;

export type ThreadShellLayoutProps = {
  viewer: ViewerSummary;
  threads: ThreadSummary[];
  selectedThreadId?: string;
  onCreateThread: () => void;
  hasResearchPayload: boolean;
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
  rateStatus: RateStatus | undefined;
  startThread: StartThread;
  sendMessage: SendMessage;
  runs: ResearchRun[];
  artifacts: ResearchArtifact[];
  sources: ResearchSource[];
  activeArtifact: ResearchArtifact | null;
  activePanelTab: "artifacts" | "sources";
  sourceFocus: SourceFocus | null;
  rightPanelOpen: boolean;
  onRightPanelOpenChange: (open: boolean) => void;
  onOpenArtifact: (artifactId: string) => void;
  onOpenSources: (focus?: SourceFocus) => void;
  onPanelTabChange: (tab: "artifacts" | "sources") => void;
  onCancelRun: (runId: string) => Promise<unknown>;
};
