import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { jsonResult, type RunToolContext } from "./context";

// Deep-research plan gate (plan §4.1). A no-side-effect tool mirroring
// proposeArtifact: it is approval-gated by canUseTool, so on the first pass the
// run interrupts (waiting_hitl) and the editable plan card is shown — the
// handler is NOT executed when canUseTool denies on interrupt. The structured
// {title, summary?, questions[]} input is captured by requestApproval as the
// interaction payload (no Markdown parsing). The handler body is only a benign
// acknowledgement for the theoretical in-window-resolve path.
//
// `_ctx` is intentionally unused: unlike askUser, this tool never calls the
// broker itself — the gate runs through canUseTool. The param is kept so the
// builder registers uniformly in buildAqshaMcpServer.
export function buildResearchPlanTool(_ctx: RunToolContext) {
  return tool(
    "proposeResearchPlan",
    "Submit your research plan for the user to review BEFORE any searching. Provide a short title, a one-sentence summary, and 3-6 focused, independently searchable sub-questions. The run pauses until the user starts, revises, or rejects the plan. Do NOT perform searches in this phase.",
    {
      title: z.string().min(1).max(120),
      summary: z.string().max(500).optional(),
      questions: z.array(z.string().min(1).max(500)).min(3).max(6),
    },
    async (args) => {
      return jsonResult({
        proposed: true,
        title: args.title,
        questions: args.questions,
      });
    },
  );
}
