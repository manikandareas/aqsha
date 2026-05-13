import type { ResearchSource } from "@/components/sources-panel";
import type { RateStatus, ResearchArtifact, ResearchRun, SendResult } from "../types";

export type ThreadSummary = {
  threadId: string;
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
      }
    | null
    | undefined;
  rateStatus: RateStatus | undefined;
  startThread: StartThread;
  sendMessage: SendMessage;
  sources: ResearchSource[];
  runs: ResearchRun[];
  artifacts: ResearchArtifact[];
  activeArtifact: ResearchArtifact | null;
  activeCitation: number | null;
  onCitationClick: (citation: number) => void;
  rightPanelOpen: boolean;
  rightPanelTab: "sources" | "artifacts";
  onRightPanelOpenChange: (open: boolean) => void;
  onRightPanelTabChange: (tab: "sources" | "artifacts") => void;
  onOpenArtifact: (artifactId: string) => void;
  onCancelRun: (runId: string) => Promise<unknown>;
  onRetryRun: (runId: string) => Promise<unknown>;
};
