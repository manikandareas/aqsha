import { env, resolveAppPath } from "../../config";
import type { AstraDeps } from "../../agents/deps";
import { resolveModel } from "../../agents/model";
import { discoverSkills } from "../../agents/skills";
import { createAstraAgentResponse } from "../../agents/streams";
import type { CreateChatResponseInput } from "./model";

export class AgentsService {
  private readonly skillsRegistryPromise = discoverSkills(
    env.ASTRA_SKILLS_ROOTS.split(",")
      .map((root) => root.trim())
      .filter(Boolean)
      .map((root) => resolveAppPath(root)),
  );

  async createChatResponse(input: CreateChatResponseInput): Promise<Response> {
    const requestId = input.requestId || crypto.randomUUID().replaceAll("-", "");

    if (!Array.isArray(input.messages)) {
      return this.jsonError(400, "invalid_messages", "Request body must include messages array.", requestId);
    }

    try {
      const deps: AstraDeps = {
        userId: input.userId || env.ASTRA_USER_ID,
        workspace: input.workspace?.trim() || env.ASTRA_WORKSPACE,
        conversationId: input.threadId,
        runId: input.runId,
        constraints: [],
      };
      const resolvedModel = resolveModel(input.model);
      const skills = await this.skillsRegistryPromise;

      return await createAstraAgentResponse({
        model: resolvedModel.model,
        providerOptions: resolvedModel.providerOptions,
        context: {
          deps,
          skills,
        },
        uiMessages: input.messages,
        abortSignal: input.abortSignal,
        onSource: input.onSource,
        headers: {
          "x-astra-request-id": requestId,
        },
      });
    } catch (error) {
      return this.jsonError(
        500,
        "agents_service_error",
        error instanceof Error ? error.message : "Agents service failed.",
        requestId,
      );
    }
  }

  private jsonError(status: number, code: string, message: string, requestId: string): Response {
    return Response.json(
      {
        error: { code, message, requestId },
      },
      {
        status,
        headers: {
          "x-astra-request-id": requestId,
        },
      },
    );
  }
}
