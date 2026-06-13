import { describe, expect, it } from "vitest";
import {
  buildArtifactBlock,
  buildHistoryBlock,
  buildWorkspaceManifestBlock,
  assemblePrompt,
} from "../src/agent/contextAssembly";
import {
  allowedToolsForTurn,
  APPROVAL_GATED_TOOL_NAMES,
  logicalToolName,
  qualifiedToolName,
} from "../src/agent/toolPolicy";
import { buildAstraQueryOptions } from "../src/agent/astra";
import { instructionsForKind } from "../src/agent/systemPrompt";
import { loadConfig } from "../src/config";
import { MemoryStore } from "../src/store/memoryStore";

describe("toolPolicy", () => {
  it("qualifies and strips MCP names symmetrically", () => {
    expect(qualifiedToolName("askUser")).toBe("mcp__aqsha__askUser");
    expect(logicalToolName("mcp__aqsha__askUser")).toBe("askUser");
    expect(logicalToolName("Bash")).toBe("Bash");
  });

  it("excludes executeArtifact on the initial turn and includes it on resume", () => {
    const initial = allowedToolsForTurn({ phase: "initial", mode: "normal" });
    expect(initial).not.toContain(qualifiedToolName("executeArtifact"));
    expect(initial).toContain(qualifiedToolName("searchWeb"));
    expect(initial).toContain(qualifiedToolName("askUser"));
    expect(initial).not.toContain("Agent");

    const resume = allowedToolsForTurn({
      phase: "resume_after_approval",
      mode: "normal",
    });
    expect(resume).toContain(qualifiedToolName("executeArtifact"));
  });

  it("keeps approval-gated tools OFF allowedTools so canUseTool is consulted", () => {
    // Verified live (Phase-0 spike): allowedTools entries are auto-allowed by
    // the SDK and canUseTool is never called for them. The hold-window only
    // works if gated tools stay absent from the allow-list.
    const initial = allowedToolsForTurn({ phase: "initial", mode: "normal" });
    for (const gated of APPROVAL_GATED_TOOL_NAMES) {
      expect(initial).not.toContain(qualifiedToolName(gated));
    }
  });

  it("allows the Agent tool only in deep mode", () => {
    expect(allowedToolsForTurn({ phase: "initial", mode: "deep" })).toContain("Agent");
  });
});

describe("buildAstraQueryOptions", () => {
  const config = loadConfig({});

  it("applies tier model + turn budget and never bypasses permissions", () => {
    const lite = buildAstraQueryOptions({
      config,
      agentKind: "lite",
      mode: "normal",
      phase: "initial",
      mcpServer: { fake: true },
    });
    expect(lite.model).toBe("claude-haiku-4-5");
    expect(lite.maxTurns).toBe(5);
    expect(lite.permissionMode).toBe("default");
    expect(lite.systemPrompt).toBe(instructionsForKind("lite"));
    expect(lite.resume).toBeUndefined();

    const pro = buildAstraQueryOptions({
      config,
      agentKind: "pro",
      mode: "normal",
      phase: "initial",
      mcpServer: {},
      resumeSessionId: "sess_1",
    });
    expect(pro.model).toBe("claude-sonnet-4-6");
    expect(pro.maxTurns).toBe(10);
    expect(pro.resume).toBe("sess_1");
  });

  it("uses the deep prompt, budget, and subagents in deep mode", () => {
    const deep = buildAstraQueryOptions({
      config,
      agentKind: "pro",
      mode: "deep",
      phase: "initial",
      mcpServer: {},
      agents: { planner: { description: "d", prompt: "p" } },
    });
    expect(deep.maxTurns).toBe(24);
    expect(String(deep.systemPrompt)).toContain("deep research");
    expect(deep.agents).toBeDefined();
    expect(deep.allowedTools).toContain("Agent");
  });
});

describe("contextAssembly", () => {
  it("clips artifact bodies to the per-artifact budget", () => {
    const block = buildArtifactBlock([
      {
        artifactId: "a1",
        title: "Long doc",
        text: "x".repeat(10_000),
      },
    ]);
    expect(block).toContain("<thread_context_artifacts>");
    expect(block.length).toBeLessThan(5_000);
    expect(block).toContain("Artifact ID: a1");
  });

  it("renders workspace manifests with item ids", () => {
    const block = buildWorkspaceManifestBlock([
      {
        workspaceId: "ws1",
        name: "Riset",
        items: [{ artifactId: "a1", title: "Paper" }],
      },
    ]);
    expect(block).toContain("<thread_workspace_context>");
    expect(block).toContain("Workspace: Riset");
    expect(block).toContain("Artifact ID: a1");
  });

  it("buildHistoryBlock skips empty messages", () => {
    expect(buildHistoryBlock([])).toBe("");
  });

  it("assemblePrompt prepends context blocks before the user prompt", async () => {
    const store = new MemoryStore();
    store.seedWorkspace({ workspaceId: "ws1", ownerUserId: "u1", name: "Riset" });
    store.seedArtifact({
      artifactId: "a1",
      ownerUserId: "u1",
      title: "Paper",
      text: "Isi paper",
      workspaceId: "ws1",
    });
    const assembled = await assemblePrompt({
      store,
      request: {
        runId: "r1",
        threadId: "t1",
        ownerUserId: "u1",
        agentKind: "lite",
        mode: "normal",
        prompt: "Ringkas paper ini",
        contextRefs: { artifactIds: ["a1"], workspaceIds: ["ws1"] },
      },
      includeHistory: false,
    });
    expect(assembled.prompt.endsWith("Ringkas paper ini")).toBe(true);
    expect(assembled.prompt).toContain("<thread_context_artifacts>");
    expect(assembled.prompt).toContain("<thread_workspace_context>");
  });
});
