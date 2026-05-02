import type { ProviderOptions } from "@ai-sdk/provider-utils";
import { createAgentUIStream, createAgentUIStreamResponse, type LanguageModel, type ToolSet, type UIMessage } from "ai";
import { buildAstraAgent } from "./agents";
import { createExaMcpTools } from "./mcp/exa";
import type { AgentRuntimeContext } from "./types";

export async function createAstraAgentUIStream({
  model,
  providerOptions,
  context,
  uiMessages,
  abortSignal,
}: {
  model: LanguageModel;
  providerOptions?: ProviderOptions;
  context: AgentRuntimeContext;
  uiMessages: UIMessage[];
  abortSignal?: AbortSignal;
}) {
  const exa = await createExaMcpTools();
  try {
    const stream = await createAgentUIStream({
      agent: buildAstraAgent({ model, providerOptions, context, externalTools: exa.tools as ToolSet }),
      uiMessages,
      abortSignal,
    });

    return stream.pipeThrough(createCleanupStream(exa.close));
  } catch (error) {
    await exa.close();
    throw error;
  }
}

export async function createAstraAgentResponse({
  model,
  providerOptions,
  context,
  uiMessages,
  abortSignal,
  headers,
}: {
  model: LanguageModel;
  providerOptions?: ProviderOptions;
  context: AgentRuntimeContext;
  uiMessages: UIMessage[];
  abortSignal?: AbortSignal;
  headers?: HeadersInit;
}) {
  const exa = await createExaMcpTools();
  try {
    const response = await createAgentUIStreamResponse({
      agent: buildAstraAgent({ model, providerOptions, context, externalTools: exa.tools as ToolSet }),
      uiMessages,
      abortSignal,
      headers,
    });

    if (!response.body) {
      await exa.close();
      return response;
    }

    return new Response(response.body.pipeThrough(createCleanupStream(exa.close)), response);
  } catch (error) {
    await exa.close();
    throw error;
  }
}

function createCleanupStream<T>(cleanup: () => Promise<void>): TransformStream<T, T> {
  const transformer = new CleanupTransformer<T>(cleanup);
  return new TransformStream<T, T>(transformer);
}

class CleanupTransformer<T> implements Transformer<T, T> {
  private cleaned = false;

  constructor(private readonly cleanup: () => Promise<void>) {}

  transform(chunk: T, controller: TransformStreamDefaultController<T>) {
    controller.enqueue(chunk);
  }

  async flush() {
    await this.runCleanup();
  }

  async cancel() {
    await this.runCleanup();
  }

  private async runCleanup() {
    if (this.cleaned) {
      return;
    }
    this.cleaned = true;
    await this.cleanup();
  }
}
