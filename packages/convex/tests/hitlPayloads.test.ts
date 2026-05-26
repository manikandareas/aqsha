import { describe, expect, it } from "vitest";
import { parseApprovedCardPayload } from "../convex/agent/hitlPayloads";

describe("hitl payloads", () => {
  it("parses workspace management payloads", () => {
    const payload = parseApprovedCardPayload(
      JSON.stringify({
        action: "create_workspace",
        name: "Tesis 2026",
      }),
    );
    expect(payload.action).toBe("create_workspace");
    if (payload.action === "create_workspace") {
      expect(payload.name).toBe("Tesis 2026");
    }
  });

  it("parses artifact delete payloads", () => {
    const payload = parseApprovedCardPayload(
      JSON.stringify({
        action: "delete",
        title: "Draft",
        artifactId: "abc123artifactid1234567890",
      }),
    );
    expect(payload.action).toBe("delete");
  });

  it("rejects unknown card actions", () => {
    expect(() =>
      parseApprovedCardPayload(JSON.stringify({ action: "unknown", title: "x" })),
    ).toThrow();
  });
});
