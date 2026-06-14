import { describe, expect, it } from "vitest";
import {
  getPromptCommand,
  resolveCommandDispatch,
} from "../convex/agent/prompt/promptCommands";

// Regression: the composer used to prepend the command slug to content that
// already carried it (`/artifact /artifact ...`), which both doubled the slug in
// the bubble and made the SDK reject the leading slash as "Unknown command".
// resolveCommandDispatch now splits the friendly bubble text from the expanded
// dispatch prompt.
describe("resolveCommandDispatch", () => {
  it("expands a normal command into its instruction without leaking the slug", () => {
    const turn = resolveCommandDispatch("/artifact cerita rakyat", "artifact");
    expect(turn.displayText).toBe("/artifact cerita rakyat");
    expect(turn.isDeep).toBe(false);
    // The dispatched prompt is the rich instruction, never a bare slash command.
    expect(turn.dispatchPrompt.startsWith("/")).toBe(false);
    expect(turn.dispatchPrompt).toContain("cerita rakyat");
    // No doubled slug anywhere in the dispatch prompt.
    expect(turn.dispatchPrompt).not.toContain("/artifact /artifact");
    expect(turn.dispatchPrompt).not.toContain("/artifact");
  });

  it("maps a deep command to the service-intercepted /deep <args>", () => {
    const turn = resolveCommandDispatch(
      "/deep-research dampak AI ke pendidikan",
      "deep-research",
    );
    expect(turn.isDeep).toBe(true);
    expect(turn.displayText).toBe("/deep-research dampak AI ke pendidikan");
    expect(turn.dispatchPrompt).toBe("/deep dampak AI ke pendidikan");
  });

  it("handles a deep command supplied as a raw question (no slug)", () => {
    const turn = resolveCommandDispatch(
      "dampak AI ke pendidikan",
      "deep-research",
    );
    expect(turn.isDeep).toBe(true);
    expect(turn.dispatchPrompt).toBe("/deep dampak AI ke pendidikan");
  });

  it("expands the argument fallback when only the slug is sent", () => {
    const artifact = getPromptCommand("artifact");
    expect(artifact).toBeTruthy();
    const turn = resolveCommandDispatch("/artifact", "artifact");
    expect(turn.dispatchPrompt).toBe(artifact?.buildPrompt(""));
  });

  it("detects the command from content when no commandId is provided", () => {
    const turn = resolveCommandDispatch("/paraphrase teks contoh");
    expect(turn.dispatchPrompt).toContain("teks contoh");
    expect(turn.dispatchPrompt.startsWith("/")).toBe(false);
  });

  it("passes plain text straight through", () => {
    const turn = resolveCommandDispatch("halo apa kabar");
    expect(turn.displayText).toBe("halo apa kabar");
    expect(turn.dispatchPrompt).toBe("halo apa kabar");
    expect(turn.isDeep).toBe(false);
  });
});
