import { query, type Options } from "@anthropic-ai/claude-agent-sdk";
import type { BridgeMessage } from "../agent/streamBridge";
import type { QueryHandle, QueryRunner } from "./runManager";

// Production QueryRunner: wraps the Claude Agent SDK query() call. Kept as the
// single point where the structurally-typed options meet the SDK's Options
// type, so the rest of the service (and all tests) stay SDK-independent.

export const sdkQueryRunner: QueryRunner = ({ prompt, options }): QueryHandle => {
  const q = query({ prompt, options: options as unknown as Options });
  return {
    // SDKMessage is a superset of the structural BridgeMessage shape.
    stream: q as unknown as AsyncIterable<BridgeMessage>,
    interrupt: () => q.interrupt(),
  };
};
