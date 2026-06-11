import { describe, expect, it } from "vitest";
import {
  buildAutoWorkspaceRoutingHint,
  detectWorkspaceManagementIntent,
  shouldAutoRouteWorkspaceCommand,
} from "../convex/agent/tools/workspaceCommandInference";

describe("workspace command inference", () => {
  it("detects create and rename intents", () => {
    expect(detectWorkspaceManagementIntent("Buat workspace untuk tesis 2026")).toBe("create");
    expect(detectWorkspaceManagementIntent("Rename workspace Draft jadi Final")).toBe("rename");
    expect(detectWorkspaceManagementIntent("Ganti nama workspace Tesis")).toBe("rename");
  });

  it("ignores read-only workspace prompts", () => {
    expect(detectWorkspaceManagementIntent("Jelaskan apa itu workspace")).toBeNull();
    expect(detectWorkspaceManagementIntent("Daftar workspace saya")).toBeNull();
  });

  it("auto-routes workspace management prompts", () => {
    expect(
      shouldAutoRouteWorkspaceCommand({
        prompt: "Bikin workspace baru untuk riset",
      }),
    ).toBe(true);
    expect(
      shouldAutoRouteWorkspaceCommand({
        prompt: "Buat workspace baru untuk tesis",
      }),
    ).toBe(true);
    expect(
      shouldAutoRouteWorkspaceCommand({
        prompt: "/artifact buat dokumen",
      }),
    ).toBe(false);
  });

  it("builds routing hints with workspace ids", () => {
    const hint = buildAutoWorkspaceRoutingHint(
      [{ workspaceId: "ws123456789012345678901234", name: "Tesis" }],
      "rename",
    );
    expect(hint).toContain("rename_workspace");
    expect(hint).toContain("Tesis");
  });
});
