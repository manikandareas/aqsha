import {
  query,
  type Options,
  type SDKMessage,
  type SDKResultMessage,
} from "@anthropic-ai/claude-agent-sdk";
import type { JsonValue } from "@aqsha/db";
import type { z } from "zod";
import type { AgentRepository } from "./repository";
import type { AgentResearchPhase, PhaseModelConfig } from "./types";

export class AgentSdkRunner {
  constructor(private readonly repository: AgentRepository) {}

  async runStructured<T>(input: {
    sessionId: string;
    workspaceId: string;
    phase: AgentResearchPhase;
    prompt: string;
    systemPrompt: string;
    schema: z.ZodType<T>;
    outputFormat: Options["outputFormat"];
    modelConfig: PhaseModelConfig;
    tools?: Options["tools"];
    mcpServers?: Options["mcpServers"];
    allowedTools?: string[];
    disallowedTools?: string[];
  }): Promise<T> {
    const run = await this.repository.startRun({
      sessionId: input.sessionId,
      workspaceId: input.workspaceId,
      phase: input.phase,
      model: input.modelConfig.model,
      maxTurns: input.modelConfig.maxTurns,
      maxBudgetUsd: input.modelConfig.maxBudgetUsd,
    });
    let resultMessage: SDKResultMessage | undefined;

    try {
      const messages = query({
        prompt: input.prompt,
        options: {
          model: input.modelConfig.model,
          systemPrompt: input.systemPrompt,
          maxTurns: input.modelConfig.maxTurns,
          maxBudgetUsd: input.modelConfig.maxBudgetUsd,
          taskBudget: { total: input.modelConfig.taskBudgetTokens },
          outputFormat: input.outputFormat,
          permissionMode: "dontAsk",
          tools: input.tools ?? [],
          mcpServers: input.mcpServers,
          allowedTools: input.allowedTools,
          disallowedTools: input.disallowedTools,
          env: {
            ...process.env,
            CLAUDE_AGENT_SDK_CLIENT_APP: "@aqsha/api",
          },
        },
      });

      for await (const message of messages) {
        await this.repository.appendEvent({
          sessionId: input.sessionId,
          runId: run.id,
          workspaceId: input.workspaceId,
          phase: input.phase,
          eventType: message.type,
          rawMessage: toJsonValue(message),
          curated: curateSdkMessage(message, input.phase),
        });

        if (message.type === "result") {
          resultMessage = message;
        }
      }

      if (!resultMessage) {
        throw new Error("Claude Agent SDK completed without a result message.");
      }

      if (resultMessage.subtype !== "success") {
        throw new Error(
          resultMessage.errors?.join("\n") || `SDK failed: ${resultMessage.subtype}`,
        );
      }

      await this.repository.finishRun(run.id, {
        status: "completed",
        sdkSessionId: resultMessage.session_id,
        sdkResultSubtype: resultMessage.subtype,
        usage: toJsonValue(resultMessage.usage),
        modelUsage: toJsonValue(resultMessage.modelUsage),
        totalCostUsd: resultMessage.total_cost_usd,
      });

      return input.schema.parse(resultMessage.structured_output);
    } catch (error) {
      await this.repository.finishRun(run.id, {
        status: "failed",
        sdkSessionId: resultMessage?.session_id,
        sdkResultSubtype: resultMessage?.subtype,
        errorMessage: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  }
}

function curateSdkMessage(
  message: SDKMessage,
  phase: AgentResearchPhase,
): JsonValue {
  if (message.type === "result") {
    return {
      type: "result",
      phase,
      subtype: message.subtype,
      isError: message.is_error,
      numTurns: message.num_turns,
      totalCostUsd: message.total_cost_usd,
    };
  }

  return {
    type: message.type,
    phase,
  };
}

function toJsonValue(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}
