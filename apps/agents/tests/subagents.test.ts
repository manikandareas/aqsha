import { describe, expect, it } from "vitest";
import { deepModelForAgent, loadConfig } from "../src/config";
import { qualifiedToolName } from "../src/agent/toolPolicy";
import { buildDeepResearchSubagents, RESEARCH_TOOLS } from "../src/subagents";

// Per-phase isolation + tool/background invariants for the deep-research
// subagents (deep-research-verification-subagents-plan §6, §8). The fake runner
// in runManager.test.ts ignores options.agents, so these are the unit guards on
// the subagent definitions themselves.

const config = loadConfig({});

describe("buildDeepResearchSubagents", () => {
  it("returns a single-subagent map per delegating phase, isolated from each other", () => {
    const map = buildDeepResearchSubagents({ config, agentKind: "pro" });
    expect(Object.keys(map.literature ?? {})).toEqual(["literature-searcher"]);
    expect(Object.keys(map.counter_evidence ?? {})).toEqual(["counter-evidence"]);
    expect(Object.keys(map.citation_verify ?? {})).toEqual(["citation-verifier"]);
    // plan/write never delegate — no entry leaks in for them.
    expect(map.plan).toBeUndefined();
    expect(map.write).toBeUndefined();
  });

  it("gives counter-evidence the full read-only research toolset and the deep model", () => {
    const map = buildDeepResearchSubagents({ config, agentKind: "lite" });
    const counter = map.counter_evidence!["counter-evidence"]!;
    expect(counter.tools).toBe(RESEARCH_TOOLS);
    expect(counter.model).toBe(deepModelForAgent(config, "lite"));
    expect(counter.maxTurns).toBe(8);
  });

  it("scopes citation-verifier to list verification only — no web search, no mutations", () => {
    const map = buildDeepResearchSubagents({ config, agentKind: "pro" });
    const verifier = map.citation_verify!["citation-verifier"]!;
    expect(verifier.tools).toEqual([qualifiedToolName("verifyIdentifiers")]);

    const forbidden = [
      "proposeArtifact",
      "executeArtifact",
      "deleteArtifact",
      "createWorkspace",
      "renameWorkspace",
      "runComputation",
      "searchWeb",
      "lookupDoi",
      "searchArxiv",
    ].map(qualifiedToolName);
    for (const name of forbidden) {
      expect(verifier.tools).not.toContain(name);
    }
    expect(verifier.model).toBe(deepModelForAgent(config, "pro"));
    expect(verifier.maxTurns).toBe(5);
  });

  it("runs both new verifiers in-context (background:false) so consolidation works", () => {
    const map = buildDeepResearchSubagents({ config, agentKind: "lite" });
    expect(map.counter_evidence!["counter-evidence"]!.background).toBe(false);
    expect(map.citation_verify!["citation-verifier"]!.background).toBe(false);
    // The literature searcher stays a parallel fire-and-forget fan-out.
    expect(map.literature!["literature-searcher"]!.background).toBe(true);
  });
});
