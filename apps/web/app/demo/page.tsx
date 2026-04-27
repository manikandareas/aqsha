"use client";

import { useCoAgent, useCopilotAction } from "@copilotkit/react-core";
import {
  type CopilotKitCSSProperties,
  CopilotSidebar,
} from "@copilotkit/react-ui";
import {
  AlertCircle,
  CheckCircle2,
  LoaderCircle,
  Search,
  Sparkles,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { api } from "@/lib/eden";

type ProgressEvent = {
  type: string;
  status: string;
  title: string;
  data?: Record<string, unknown>;
};

type StreamChunk = {
  content: string;
  chunkType?: string;
  taskName?: string;
  agentRole?: string;
};

type AgentState = {
  userId?: string | null;
  workspaceId?: string | null;
  status?: "running" | "completed" | "failed" | string;
  phase?: string;
  currentStep?: string;
  response?: string | null;
  chat_response?: string | null;
  streamedResponse?: string;
  route_reasoning?: string | null;
  search_queries?: string[];
  suggested_search_queries?: string[];
  activeQueries?: string[];
  candidateCount?: number;
  evidenceCount?: number;
  events?: ProgressEvent[];
  streamChunks?: StreamChunk[];
  message_history?: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
};

type AgentIdentity = {
  userId: string;
  workspaceId: string;
};

type StatusIconProps = {
  status?: string;
  className: string;
};

export default function CopilotKitPage() {
  const [themeColor, setThemeColor] = useState("#0075de");
  const [agentIdentity, setAgentIdentity] = useState<AgentIdentity | null>(
    null,
  );
  const [bootstrapStatus, setBootstrapStatus] = useState<
    "loading" | "ready" | "unavailable"
  >("loading");

  useEffect(() => {
    let isMounted = true;

    async function loadAgentIdentity() {
      try {
        const response = await api.session.bootstrap.get();
        const bootstrap = response.data;

        if (!isMounted) {
          return;
        }

        if (response.error || !bootstrap) {
          setBootstrapStatus("unavailable");
          return;
        }

        setAgentIdentity({
          userId: bootstrap.user.id,
          workspaceId: bootstrap.workspace.id,
        });
        setBootstrapStatus("ready");
      } catch {
        if (isMounted) {
          setBootstrapStatus("unavailable");
        }
      }
    }

    void loadAgentIdentity();

    return () => {
      isMounted = false;
    };
  }, []);

  useCopilotAction({
    name: "setThemeColor",
    parameters: [
      {
        name: "themeColor",
        description: "The theme color to set. Make sure to pick nice colors.",
        required: true,
      },
    ],
    handler({ themeColor }) {
      setThemeColor(themeColor);
    },
  });

  return (
    <main
      style={
        { "--copilot-kit-primary-color": themeColor } as CopilotKitCSSProperties
      }
    >
      {bootstrapStatus === "loading" ? (
        <DemoShell themeColor={themeColor}>
          <div className="flex min-h-screen items-center justify-center px-4 text-white">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-sm font-semibold">
              <LoaderCircle className="h-4 w-4 animate-spin" />
              Loading workspace context
            </div>
          </div>
        </DemoShell>
      ) : null}

      {bootstrapStatus === "unavailable" || !agentIdentity ? (
        <DemoShell themeColor={themeColor}>
          <div className="flex min-h-screen items-center justify-center px-4 text-center text-white">
            <div className="rounded-xl bg-white/15 px-5 py-4">
              <p className="text-sm font-semibold">
                Sign in and complete workspace setup before running the agent.
              </p>
            </div>
          </div>
        </DemoShell>
      ) : null}

      {bootstrapStatus === "ready" && agentIdentity ? (
      <CopilotSidebar
        disableSystemMessage={true}
        clickOutsideToClose={false}
        labels={{
          title: "Deep Research Assistant",
          initial: "Ask a research question and watch the run unfold.",
        }}
        suggestions={[
          {
            title: "Deep Research",
            message: "Research the current CrewAI Flow ecosystem.",
          },
          {
            title: "Compare",
            message: "Compare CopilotKit AG-UI and direct REST integration.",
          },
          {
            title: "Frontend Tools",
            message: "Set the theme to green.",
          },
          {
            title: "Casual Chat",
            message: "Hello, what can you do?",
          },
          {
            title: "Weather UI",
            message: "Get the weather in San Francisco.",
          },
        ]}
      >
        <YourMainContent
          agentIdentity={agentIdentity}
          themeColor={themeColor}
        />
      </CopilotSidebar>
      ) : null}
    </main>
  );
}

function DemoShell({
  children,
  themeColor,
}: {
  children: ReactNode;
  themeColor: string;
}) {
  return (
    <div
      style={{ backgroundColor: themeColor }}
      className="min-h-screen transition-colors duration-300"
    >
      {children}
    </div>
  );
}

function YourMainContent({
  agentIdentity,
  themeColor,
}: {
  agentIdentity: AgentIdentity;
  themeColor: string;
}) {
  const { state } = useCoAgent<AgentState>({
    name: "deep_research_agent",
    initialState: {
      userId: agentIdentity.userId,
      workspaceId: agentIdentity.workspaceId,
      response: null,
      chat_response: null,
      streamedResponse: "",
      route_reasoning: null,
      search_queries: [],
      suggested_search_queries: [],
      activeQueries: [],
      events: [],
      streamChunks: [],
      message_history: [],
    },
  });

  useCopilotAction({
    name: "get_weather",
    description: "Get the weather for a given location.",
    available: "disabled",
    parameters: [{ name: "location", type: "string", required: true }],
    render: ({ args }) => {
      return <WeatherCard location={args.location} themeColor={themeColor} />;
    },
  });

  const latestResponse =
    state.response ?? state.chat_response ?? state.streamedResponse;
  const queries = getVisibleQueries(state);
  const events = state.events ?? [];
  const isRunning = state.status === "running";

  return (
    <div
      style={{ backgroundColor: themeColor }}
      className="min-h-screen px-4 py-8 transition-colors duration-300"
    >
      <div className="mx-auto grid w-full max-w-6xl gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="min-h-[calc(100vh-4rem)] rounded-2xl bg-white/20 p-6 text-white shadow-xl backdrop-blur-md">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/20 pb-5">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.125px] text-white/85">
                {isRunning ? (
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                {state.phase ?? "idle"}
              </div>
              <h1 className="text-3xl font-bold leading-tight text-white">
                Deep Research
              </h1>
            </div>
            <StatusBadge status={state.status} />
          </div>

          <div className="mt-5 min-h-[320px] rounded-xl bg-white/15 p-4">
            {latestResponse ? (
              <p className="whitespace-pre-wrap text-sm leading-6 text-white md:text-base">
                {latestResponse}
              </p>
            ) : (
              <div className="flex h-[280px] items-center justify-center text-center text-sm text-white/80">
                Ask from the assistant panel to start a research run.
              </div>
            )}
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <Metric label="Candidates" value={state.candidateCount ?? 0} />
            <Metric label="Evidence" value={state.evidenceCount ?? 0} />
            <Metric label="Events" value={events.length} />
          </div>
        </section>

        <aside className="flex min-h-[calc(100vh-4rem)] flex-col gap-4 rounded-2xl bg-white/20 p-4 text-white shadow-xl backdrop-blur-md">
          <section>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-[0.125px] text-white/80">
              Current Step
            </h2>
            <div className="rounded-xl bg-white/15 p-3 text-sm">
              {state.currentStep ?? "Idle"}
            </div>
          </section>

          <section>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-[0.125px] text-white/80">
              Queries
            </h2>
            <div className="max-h-44 overflow-y-auto rounded-xl bg-white/15 p-3">
              {queries?.length ? (
                <ul className="space-y-2">
                  {queries.map((query) => (
                    <li key={query} className="flex gap-2 text-sm text-white/90">
                      <Search className="mt-0.5 h-3.5 w-3.5 shrink-0 text-white/70" />
                      <span>{query}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-white/70">No queries yet.</p>
              )}
            </div>
          </section>

          <section className="min-h-0 flex-1">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-[0.125px] text-white/80">
              Timeline
            </h2>
            <div className="max-h-[420px] space-y-2 overflow-y-auto rounded-xl bg-white/15 p-3">
              {events.length ? (
                events
                  .slice()
                  .reverse()
                  .map((event, index) => (
                    <ProgressRow
                      event={event}
                      key={`${event.type}-${events.length - index}`}
                    />
                  ))
              ) : (
                <p className="text-sm text-white/70">No activity yet.</p>
              )}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

function getVisibleQueries(state: AgentState): string[] | undefined {
  if (state.search_queries?.length) {
    return state.search_queries;
  }
  if (state.activeQueries?.length) {
    return state.activeQueries;
  }
  return state.suggested_search_queries;
}

function StatusIcon({ status, className }: StatusIconProps) {
  if (status === "failed") {
    return <AlertCircle className={className} />;
  }
  if (status === "completed") {
    return <CheckCircle2 className={className} />;
  }
  return <LoaderCircle className={`${className} animate-spin`} />;
}

function StatusBadge({ status }: { status?: string }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.125px] text-white/85">
      <StatusIcon status={status} className="h-3.5 w-3.5" />
      {status ?? "idle"}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-white/15 p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.125px] text-white/70">
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold text-white">{value}</p>
    </div>
  );
}

function ProgressRow({ event }: { event: ProgressEvent }) {
  return (
    <div className="flex gap-3 rounded-lg bg-white/10 p-3">
      <div className="mt-0.5">
        <StatusIcon status={event.status} className="h-4 w-4 text-white" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-white">{event.title}</p>
        <p className="mt-0.5 truncate text-xs text-white/70">{event.type}</p>
      </div>
    </div>
  );
}

function SunIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className="h-14 w-14 text-yellow-200"
    >
      <circle cx="12" cy="12" r="5" />
      <path
        d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"
        strokeWidth="2"
        stroke="currentColor"
      />
    </svg>
  );
}

function WeatherCard({
  location,
  themeColor,
}: {
  location?: string;
  themeColor: string;
}) {
  return (
    <div
      style={{ backgroundColor: themeColor }}
      className="my-4 w-full max-w-md rounded-xl shadow-xl"
    >
      <div className="w-full bg-white/20 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xl font-bold capitalize text-white">
              {location}
            </h3>
            <p className="text-white">Current Weather</p>
          </div>
          <SunIcon />
        </div>

        <div className="mt-4 flex items-end justify-between">
          <div className="text-3xl font-bold text-white">70°</div>
          <div className="text-sm text-white">Clear skies</div>
        </div>

        <div className="mt-4 border-t border-white pt-4">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-xs text-white">Humidity</p>
              <p className="font-medium text-white">45%</p>
            </div>
            <div>
              <p className="text-xs text-white">Wind</p>
              <p className="font-medium text-white">5 mph</p>
            </div>
            <div>
              <p className="text-xs text-white">Feels Like</p>
              <p className="font-medium text-white">72°</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
