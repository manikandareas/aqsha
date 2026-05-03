import { env, resolveAppPath } from "../../config";
import type { AstraDeps } from "../../agents/deps";
import { resolveModel } from "../../agents/model";
import {
  DaytonaScriptExecutor,
  DaytonaSdkScriptExecutorClient,
  discoverSkills,
  LocalScriptExecutor,
  type SkillScriptExecutor,
} from "../../agents/skills";
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
        researchArtifactDir: resolveAppPath(env.ASTRA_RESEARCH_ARTIFACT_DIR),
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
          skillScriptsEnabled: env.ASTRA_ENABLE_SKILL_SCRIPTS,
          skillScriptTimeoutMs: env.ASTRA_SKILL_SCRIPT_TIMEOUT_MS,
          scriptExecutor: env.ASTRA_ENABLE_SKILL_SCRIPTS ? this.createScriptExecutor() : undefined,
          sandboxImageRef: env.ASTRA_RESEARCH_SANDBOX_IMAGE_REF,
        },
        uiMessages: input.messages,
        abortSignal: input.abortSignal,
        onSource: input.onSource,
        onAgentEvent: input.onAgentEvent,
        onArtifact: input.onArtifact,
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

  private createScriptExecutor(): SkillScriptExecutor {
    if (env.ASTRA_SKILL_SCRIPT_EXECUTOR === "local") {
      return new LocalScriptExecutor();
    }

    if (!env.ASTRA_RESEARCH_SANDBOX_IMAGE_REF) {
      throw new Error("ASTRA_RESEARCH_SANDBOX_IMAGE_REF is required when ASTRA_SKILL_SCRIPT_EXECUTOR=daytona.");
    }

    return new DaytonaScriptExecutor({
      imageRef: env.ASTRA_RESEARCH_SANDBOX_IMAGE_REF,
      client: new DaytonaSdkScriptExecutorClient({
        apiKey: env.DAYTONA_API_KEY,
        apiUrl: env.DAYTONA_API_URL,
        target: env.DAYTONA_TARGET,
      }),
    });
  }
}
