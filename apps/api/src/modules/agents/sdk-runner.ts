import {
  Agent,
  run,
  setDefaultOpenAIKey,
  type MCPServer,
  type Tool,
} from "@openai/agents";
import type { JsonValue } from "@aqsha/db";
import type { z } from "zod";
import type { AgentOutputType } from "@openai/agents";
import { env } from "../../config";
import type { AgentRepository } from "./repository";
import type { AgentResearchPhase, PhaseModelConfig } from "./types";

// Register the default OpenAI API key lazily — the SDK otherwise tries to
// construct an OpenAI client from `OPENAI_API_KEY` at first use.
let defaultKeyRegistered = false;
function ensureDefaultOpenAIKey() {
  if (defaultKeyRegistered) return;
  if (!env.OPENAI_API_KEY) {
    throw new Error(
      "OPENAI_API_KEY is not configured. The research agent requires an OpenAI API key.",
    );
  }
  setDefaultOpenAIKey(env.OPENAI_API_KEY);
  defaultKeyRegistered = true;
}

export class AgentSdkRunner {
  constructor(private readonly repository: AgentRepository) {}

  /**
   * Runs one phase of the research workflow with the OpenAI Agents SDK and
   * returns the agent's final structured output. See
   * `agentic-research-design-v2.md` §8 for the contract.
   */
  async runStructured<T>(input: {
    sessionId: string;
    workspaceId: string;
    phase: AgentResearchPhase;
    prompt: string;
    systemPrompt: string;
    schema: z.ZodObject<z.ZodRawShape, z.core.$strip> & z.ZodType<T>;
    modelConfig: PhaseModelConfig;
    /**
     * Function tools the agent may call. Includes MCP-backed tools resolved
     * by the caller (we manage MCP server lifecycles outside the runner so
     * connection can be reused across phases).
     */
    tools?: Tool<unknown>[];
    /**
     * Optional list of MCP servers whose tools are merged into the agent's
     * tool surface by the SDK. Caller owns connect() / close().
     */
    mcpServers?: MCPServer[];
  }): Promise<T> {
    ensureDefaultOpenAIKey();

    const runRecord = await this.repository.startRun({
      sessionId: input.sessionId,
      workspaceId: input.workspaceId,
      phase: input.phase,
      model: input.modelConfig.model,
      maxTurns: input.modelConfig.maxTurns,
      maxBudgetUsd: input.modelConfig.maxBudgetUsd,
    });

    try {
      const agent = new Agent({
        name: `aqsha-${input.phase}`,
        model: input.modelConfig.model,
        instructions: input.systemPrompt,
        tools: input.tools ?? [],
        mcpServers: input.mcpServers ?? [],
        // Enforce JSON output matching the phase's Zod schema.
        outputType: input.schema as unknown as AgentOutputType,
      });

      const result = await run(agent, input.prompt, {
        maxTurns: input.modelConfig.maxTurns,
        stream: false,
      });

      const finalOutput = result.finalOutput;
      if (finalOutput === undefined || finalOutput === null) {
        throw new Error(
          `OpenAI Agents SDK produced no final output for phase ${input.phase}.`,
        );
      }

      const usage = result.state._context.usage;
      const curatedMessages = result.newItems.map((item) =>
        curateItem(item, input.phase),
      );
      for (const curated of curatedMessages) {
        await this.repository.appendEvent({
          sessionId: input.sessionId,
          runId: runRecord.id,
          workspaceId: input.workspaceId,
          phase: input.phase,
          eventType: String(
            (curated as { type?: string } | null)?.type ?? "item",
          ),
          curated,
        });
      }

      await this.repository.finishRun(runRecord.id, {
        status: "completed",
        sdkSessionId: result.lastResponseId,
        sdkResultSubtype: "success",
        usage: toJsonValue({
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          totalTokens: usage.totalTokens,
          requests: usage.requests,
        }),
        modelUsage: toJsonValue(usage.requestUsageEntries ?? []),
      });

      // finalOutput is typed against the Zod schema but pass through parse to
      // be defensive about surprise shapes.
      return input.schema.parse(finalOutput);
    } catch (error) {
      await this.repository.finishRun(runRecord.id, {
        status: "failed",
        errorMessage: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  }
}

function curateItem(item: unknown, phase: AgentResearchPhase): JsonValue {
  if (!item || typeof item !== "object") {
    return { phase, type: "unknown" };
  }

  const record = item as Record<string, unknown>;
  const type = typeof record.type === "string" ? record.type : "unknown";
  return { phase, type };
}

function toJsonValue(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}
