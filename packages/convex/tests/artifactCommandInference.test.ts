import { describe, expect, it } from "vitest";
import {
  buildAutoArtifactRoutingHint,
  detectWorkspaceArtifactMutationIntent,
  findExplicitPromptCommandInContent,
  shouldAutoRouteArtifactCommand,
} from "../convex/agent/artifactCommandInference";

describe("artifact command inference", () => {
  const selectedDoc = {
    artifactId: "abc123artifactid1234567890",
    workspaceId: "ws123workspaceid12345678901",
    title: "Kancil dan Buaya",
  };

  it("detects update intent in Indonesian prompts", () => {
    expect(
      detectWorkspaceArtifactMutationIntent("Perbarui ending cerita ini jadi lebih dramatis"),
    ).toBe("update");
    expect(detectWorkspaceArtifactMutationIntent("Edit paragraf pertama")).toBe("update");
  });

  it("ignores read-only prompts", () => {
    expect(detectWorkspaceArtifactMutationIntent("Jelaskan isi artifact ini")).toBeNull();
    expect(detectWorkspaceArtifactMutationIntent("Ringkas cerita ini")).toBeNull();
  });

  it("ignores workspace management prompts even with selected artifacts", () => {
    expect(detectWorkspaceArtifactMutationIntent("Buat workspace baru untuk tesis")).toBeNull();
    expect(
      shouldAutoRouteArtifactCommand({
        prompt: "Buat workspace baru untuk tesis",
        selectedWorkspaceDocuments: [selectedDoc],
      }),
    ).toBe(false);
  });

  it("does not auto-route when another slash command is present", () => {
    expect(
      shouldAutoRouteArtifactCommand({
        prompt: "/deep-research perbarui cerita ini",
        selectedWorkspaceDocuments: [selectedDoc],
      }),
    ).toBe(false);
    expect(findExplicitPromptCommandInContent("/summarize cerita ini")).not.toBeNull();
  });

  it("auto-routes selected workspace artifacts with edit intent", () => {
    expect(
      shouldAutoRouteArtifactCommand({
        prompt: "Tambahkan paragraf penutup yang lebih kuat",
        selectedWorkspaceDocuments: [selectedDoc],
      }),
    ).toBe(true);
  });

  it("builds routing hints with artifact and workspace ids", () => {
    const hint = buildAutoArtifactRoutingHint([selectedDoc], "update");
    expect(hint).toContain(selectedDoc.artifactId);
    expect(hint).toContain(selectedDoc.workspaceId);
    expect(hint).toContain("action=update");
  });
});
