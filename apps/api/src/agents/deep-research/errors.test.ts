import { describe, expect, test } from "bun:test";

import {
  ClassifiedResearchError,
  classifyResearchError,
  classifyTrustedScriptError,
} from "./errors";

describe("Deep Research error classification", () => {
  test("maps trusted sandbox errors into stable research error classes", () => {
    expect(
      classifyTrustedScriptError({
        code: "sandbox_create_failed",
        message: "Sandbox provider was unavailable.",
      }),
    ).toEqual(
      expect.objectContaining({
        errorClass: "sandbox",
        errorCode: "sandbox_create_failed",
        retryable: true,
      }),
    );
    expect(
      classifyTrustedScriptError({
        code: "sandbox_dependency_failed",
        message: "Renderer dependency install failed.",
      }),
    ).toEqual(
      expect.objectContaining({
        errorClass: "dependency",
        errorCode: "sandbox_dependency_failed",
        retryable: false,
      }),
    );
    expect(
      classifyTrustedScriptError({
        code: "invalid_script_id",
        message: "Script id is not allowlisted.",
      }),
    ).toEqual(
      expect.objectContaining({
        errorClass: "model_tool_misuse",
        errorCode: "invalid_script_id",
        retryable: false,
      }),
    );
  });

  test("preserves existing classified errors and classifies plain errors with fallback context", () => {
    const classified = new ClassifiedResearchError({
      errorClass: "uploadthing",
      errorCode: "uploadthing_failure",
      message: "Upload failed.",
    });

    expect(classifyResearchError(classified, "unknown")).toBe(classified);
    expect(classifyResearchError(new Error("Renderer crashed."), "render")).toEqual(
      expect.objectContaining({
        errorClass: "render",
        errorCode: "render_failure",
        retryable: true,
        developerDetail: expect.objectContaining({
          message: "Renderer crashed.",
        }),
      }),
    );
  });
});
