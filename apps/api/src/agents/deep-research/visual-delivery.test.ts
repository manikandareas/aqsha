import { describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { artifactManifestSchema } from "./contracts";
import {
  createPngArtifactPublishAdapter,
  createFinalVisualArtifactsMarkdown,
  createTrustedSkillVisualRenderer,
  renderAndPublishVisualArtifacts,
  retryVisualArtifactDelivery,
} from "./visual-delivery";
import type { SkillMetadata } from "../skills";

async function createDeepResearchSkillFixture() {
  const directory = await mkdtemp(join(tmpdir(), "aqsha-deep-research-skill-"));
  await mkdir(join(directory, "scripts"), { recursive: true });
  await writeFile(join(directory, "SKILL.md"), "---\nname: deep-research\ndescription: Deep Research\n---\n");
  await writeFile(
    join(directory, "scripts", "manifest.json"),
    JSON.stringify({
      version: 1,
      scripts: [
        {
          id: "render-vega",
          file: "render-vega.ts",
          runtime: "bun",
          timeoutMs: 30_000,
          args: { maxCount: 8, maxLength: 12_000 },
          outputs: [{ path: "artifacts/*.png", contentType: "image/png", role: "visual" }],
          network: "disabled",
        },
      ],
    }),
  );
  await writeFile(join(directory, "scripts", "render-vega.ts"), "console.log('rendered');\n");

  return {
    name: "deep-research",
    description: "Deep Research",
    directory,
    skillFile: join(directory, "SKILL.md"),
  } satisfies SkillMetadata;
}

describe("Deep Research visual delivery", () => {
  test("embeds every passed final visual artifact from the Artifact Manifest in display order", () => {
    const manifest = artifactManifestSchema.parse({
      artifacts: [
        {
          artifactId: "artifact_matrix",
          visualId: "claims-matrix",
          status: "passed",
          title: "Claims evidence matrix",
          caption: "Claims mapped to verified Ledger Source IDs.",
          outputIntent: "final_report_embed",
          contentType: "image/png",
          url: "https://utfs.io/f/claims-matrix.png",
          fileKey: "claims-matrix.png",
          sourceIds: ["S1", "S2"],
          metricIds: ["M2"],
          displayOrder: 2,
        },
        {
          artifactId: "artifact_timeline",
          visualId: "evidence-timeline",
          status: "passed",
          title: "Evidence timeline",
          caption: "Publication timeline for verified sources.",
          outputIntent: "final_report_embed",
          contentType: "image/png",
          url: "https://utfs.io/f/evidence-timeline.png",
          fileKey: "evidence-timeline.png",
          sourceIds: ["S1"],
          metricIds: ["M1"],
          displayOrder: 1,
        },
        {
          artifactId: "artifact_preview",
          visualId: "research-trail-preview",
          status: "passed",
          title: "Research Trail preview",
          caption: "Internal preview.",
          outputIntent: "research_trail_preview",
          contentType: "image/png",
          url: "https://utfs.io/f/preview.png",
          fileKey: "preview.png",
          sourceIds: ["S1"],
          metricIds: ["M3"],
          displayOrder: 0,
        },
        {
          artifactId: "artifact_omitted",
          visualId: "unsupported-chart",
          status: "omitted",
          title: "Unsupported chart",
          caption: "Omitted visual.",
          outputIntent: "final_report_embed",
          contentType: "image/png",
          sourceIds: ["S1"],
          metricIds: [],
          reason: "Missing metric references in the Evidence Ledger.",
          displayOrder: 3,
        },
      ],
    });

    expect(createFinalVisualArtifactsMarkdown(manifest)).toBe(
      [
        "![Evidence timeline](https://utfs.io/f/evidence-timeline.png)",
        "",
        "_Publication timeline for verified sources._",
        "",
        "![Claims evidence matrix](https://utfs.io/f/claims-matrix.png)",
        "",
        "_Claims mapped to verified Ledger Source IDs._",
      ].join("\n"),
    );
  });

  test("fails invalid Visual Specs before renderer execution with a structured validation error", async () => {
    let renderCalls = 0;
    let publishCalls = 0;

    const result = await renderAndPublishVisualArtifacts({
      evidenceLedger: {
        sources: [
          {
            sourceId: "S1",
            title: "Evidence-aware writing assistants",
            sourceType: "study",
            verificationStatus: "verified",
          },
        ],
        claims: [],
        visualMetrics: [],
      },
      visualSpecs: [
        {
          visualId: "unsupported-chart",
          visualKind: "timeline",
          title: "Unsupported chart",
          labels: ["2024"],
          dataReferences: [
            {
              referenceType: "metric",
              referenceId: "MISSING",
            },
          ],
          sourceIds: ["S1"],
          metricIds: ["MISSING"],
          caption: "Unsupported metric chart.",
          outputIntent: "final_report_embed",
        },
      ],
      renderVisual: async () => {
        renderCalls += 1;
        throw new Error("Renderer should not run for invalid Visual Spec.");
      },
      publishVisual: async () => {
        publishCalls += 1;
        throw new Error("Publisher should not run for invalid Visual Spec.");
      },
    });

    expect(result).toEqual({
      status: "failed",
      manifest: {
        artifacts: [],
        metadata: expect.objectContaining({
          errorClass: "validation",
          errorCode: "invalid_visual_spec",
        }),
      },
      markdown: "",
      events: [
        expect.objectContaining({
          type: "visual_spec_validation_failed",
          scope: "error",
          status: "failed",
          title: "Visual Spec validation failed",
          payload: expect.objectContaining({
            errorClass: "validation",
            errorCode: "invalid_visual_spec",
          }),
        }),
      ],
    });
    expect(renderCalls).toBe(0);
    expect(publishCalls).toBe(0);
  });

  test("renders valid Visual Specs, publishes PNG artifacts, and returns a passed manifest with final Markdown embeds", async () => {
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const renderedVisualIds: string[] = [];
    const publishedVisualIds: string[] = [];

    const result = await renderAndPublishVisualArtifacts({
      evidenceLedger: {
        sources: [
          {
            sourceId: "S1",
            title: "Evidence-aware writing assistants",
            sourceType: "study",
            verificationStatus: "verified",
          },
        ],
        claims: [],
        visualMetrics: [
          {
            metricId: "M1",
            label: "Included sources",
            value: 12,
            sourceIds: ["S1"],
          },
        ],
      },
      visualSpecs: [
        {
          visualId: "evidence-timeline",
          visualKind: "timeline",
          title: "Evidence timeline",
          labels: ["2024"],
          dataReferences: [
            {
              referenceType: "metric",
              referenceId: "M1",
            },
          ],
          sourceIds: ["S1"],
          metricIds: ["M1"],
          caption: "Publication timeline for verified sources.",
          outputIntent: "final_report_embed",
          displayOrder: 1,
        },
      ],
      renderVisual: async (visualSpec) => {
        renderedVisualIds.push(visualSpec.visualId);

        return {
          visualId: visualSpec.visualId,
          bytes: pngBytes,
          filename: `${visualSpec.visualId}.png`,
          contentType: "image/png",
        };
      },
      publishVisual: async (rendered, visualSpec) => {
        publishedVisualIds.push(visualSpec.visualId);
        expect(rendered.bytes).toBe(pngBytes);

        return {
          artifactId: "artifact_timeline",
          url: "https://utfs.io/f/evidence-timeline.png",
          fileKey: "evidence-timeline.png",
        };
      },
    });

    expect(renderedVisualIds).toEqual(["evidence-timeline"]);
    expect(publishedVisualIds).toEqual(["evidence-timeline"]);
    expect(result).toEqual({
      status: "completed",
      manifest: {
        artifacts: [
          {
            artifactId: "artifact_timeline",
            visualId: "evidence-timeline",
            status: "passed",
            title: "Evidence timeline",
            caption: "Publication timeline for verified sources.",
            outputIntent: "final_report_embed",
            contentType: "image/png",
            url: "https://utfs.io/f/evidence-timeline.png",
            fileKey: "evidence-timeline.png",
            sourceIds: ["S1"],
            metricIds: ["M1"],
            displayOrder: 1,
            metadata: {
              rendererContentType: "image/png",
              rendererFilename: "evidence-timeline.png",
            },
          },
        ],
      },
      markdown: [
        "![Evidence timeline](https://utfs.io/f/evidence-timeline.png)",
        "",
        "_Publication timeline for verified sources._",
      ].join("\n"),
      events: [
        expect.objectContaining({
          type: "visual_artifact_published",
          scope: "tool",
          status: "completed",
          title: "Visual artifact published",
          payload: expect.objectContaining({
            artifactId: "artifact_timeline",
            visualId: "evidence-timeline",
            sourceIds: ["S1"],
            metricIds: ["M1"],
          }),
        }),
      ],
    });
  });

  test("classifies renderer failures without publishing or leaking provider detail into the Failure Summary", async () => {
    let publishCalls = 0;

    const result = await renderAndPublishVisualArtifacts({
      evidenceLedger: {
        sources: [
          {
            sourceId: "S1",
            title: "Evidence-aware writing assistants",
            sourceType: "study",
            verificationStatus: "verified",
          },
        ],
        claims: [],
        visualMetrics: [
          {
            metricId: "M1",
            label: "Included sources",
            value: 12,
            sourceIds: ["S1"],
          },
        ],
      },
      visualSpecs: [
        {
          visualId: "evidence-timeline",
          visualKind: "timeline",
          title: "Evidence timeline",
          labels: ["2024"],
          dataReferences: [{ referenceType: "metric", referenceId: "M1" }],
          sourceIds: ["S1"],
          metricIds: ["M1"],
          caption: "Publication timeline for verified sources.",
          outputIntent: "final_report_embed",
          displayOrder: 1,
        },
      ],
      renderVisual: async () => {
        throw new Error("Vega renderer crashed with internal stack trace.");
      },
      publishVisual: async () => {
        publishCalls += 1;
        throw new Error("Publisher should not run after renderer failure.");
      },
    });

    expect(result).toEqual({
      status: "failed",
      manifest: {
        artifacts: [
          expect.objectContaining({
            artifactId: "failed_evidence-timeline",
            visualId: "evidence-timeline",
            status: "failed",
            reason: "Visual artifact render failed. You can retry delivery.",
            metadata: expect.objectContaining({
              errorClass: "render",
              retryable: true,
              developerDetail: expect.objectContaining({
                message: "Vega renderer crashed with internal stack trace.",
              }),
            }),
          }),
        ],
        metadata: expect.objectContaining({
          errorClass: "render",
        }),
      },
      markdown: "",
      events: [
        expect.objectContaining({
          type: "visual_artifact_render_failed",
          scope: "error",
          status: "failed",
          summary: "Visual artifact render failed. You can retry delivery.",
          payload: expect.objectContaining({
            errorClass: "render",
            visualId: "evidence-timeline",
          }),
        }),
      ],
    });
    expect(publishCalls).toBe(0);
  });

  test("classifies upload failures without leaking provider detail into the Failure Summary", async () => {
    const result = await renderAndPublishVisualArtifacts({
      evidenceLedger: {
        sources: [
          {
            sourceId: "S1",
            title: "Evidence-aware writing assistants",
            sourceType: "study",
            verificationStatus: "verified",
          },
        ],
        claims: [],
        visualMetrics: [
          {
            metricId: "M1",
            label: "Included sources",
            value: 12,
            sourceIds: ["S1"],
          },
        ],
      },
      visualSpecs: [
        {
          visualId: "evidence-timeline",
          visualKind: "timeline",
          title: "Evidence timeline",
          labels: ["2024"],
          dataReferences: [{ referenceType: "metric", referenceId: "M1" }],
          sourceIds: ["S1"],
          metricIds: ["M1"],
          caption: "Publication timeline for verified sources.",
          outputIntent: "final_report_embed",
          displayOrder: 1,
        },
      ],
      renderVisual: async (visualSpec) => ({
        visualId: visualSpec.visualId,
        bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        filename: `${visualSpec.visualId}.png`,
        contentType: "image/png",
      }),
      publishVisual: async () => {
        throw new Error("UploadThing rejected the PNG with provider details.");
      },
    });

    expect(result).toEqual({
      status: "failed",
      manifest: {
        artifacts: [
          expect.objectContaining({
            artifactId: "failed_evidence-timeline",
            visualId: "evidence-timeline",
            status: "failed",
            reason: "Visual artifact upload failed. You can retry delivery.",
            metadata: expect.objectContaining({
              errorClass: "uploadthing",
              retryable: true,
              developerDetail: expect.objectContaining({
                message: "UploadThing rejected the PNG with provider details.",
              }),
            }),
          }),
        ],
        metadata: expect.objectContaining({
          errorClass: "uploadthing",
        }),
      },
      markdown: "",
      events: [
        expect.objectContaining({
          type: "visual_artifact_upload_failed",
          scope: "error",
          status: "failed",
          summary: "Visual artifact upload failed. You can retry delivery.",
          payload: expect.objectContaining({
            errorClass: "uploadthing",
            visualId: "evidence-timeline",
          }),
        }),
      ],
    });
  });

  test("retries one render delivery attempt from existing Evidence Ledger and Visual Spec lineage", async () => {
    const renderedVisualIds: string[] = [];

    const result = await retryVisualArtifactDelivery({
      attemptNumber: 2,
      phase: "render",
      visualId: "evidence-timeline",
      originalArtifactId: "failed_evidence-timeline",
      evidenceLedger: {
        sources: [
          {
            sourceId: "S1",
            title: "Evidence-aware writing assistants",
            sourceType: "study",
            verificationStatus: "verified",
          },
        ],
        claims: [],
        visualMetrics: [
          {
            metricId: "M1",
            label: "Included sources",
            value: 12,
            sourceIds: ["S1"],
          },
        ],
      },
      visualSpecs: [
        {
          visualId: "evidence-timeline",
          visualKind: "timeline",
          title: "Evidence timeline",
          labels: ["2024"],
          dataReferences: [{ referenceType: "metric", referenceId: "M1" }],
          sourceIds: ["S1"],
          metricIds: ["M1"],
          caption: "Publication timeline for verified sources.",
          outputIntent: "final_report_embed",
          displayOrder: 1,
        },
        {
          visualId: "other-final-visual",
          visualKind: "timeline",
          title: "Other visual",
          labels: ["2024"],
          dataReferences: [{ referenceType: "metric", referenceId: "M1" }],
          sourceIds: ["S1"],
          metricIds: ["M1"],
          caption: "Other final visual.",
          outputIntent: "final_report_embed",
          displayOrder: 2,
        },
      ],
      renderVisual: async (visualSpec) => {
        renderedVisualIds.push(visualSpec.visualId);

        return {
          visualId: visualSpec.visualId,
          bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
          filename: `${visualSpec.visualId}.png`,
          contentType: "image/png",
        };
      },
      publishVisual: async (rendered, visualSpec) => ({
        artifactId: `artifact_${visualSpec.visualId}`,
        url: `https://utfs.io/f/${rendered.filename}`,
        fileKey: rendered.filename,
      }),
    });

    expect(renderedVisualIds).toEqual(["evidence-timeline"]);
    expect(result.events).toEqual([
      expect.objectContaining({
        type: "delivery_retry_started",
        payload: expect.objectContaining({
          attemptNumber: 2,
          phase: "render",
          visualId: "evidence-timeline",
          originalArtifactId: "failed_evidence-timeline",
        }),
      }),
      expect.objectContaining({
        type: "visual_artifact_published",
      }),
      expect.objectContaining({
        type: "delivery_retry_succeeded",
        payload: expect.objectContaining({
          attemptNumber: 2,
          phase: "render",
          visualId: "evidence-timeline",
        }),
      }),
    ]);
    expect(result.manifest.artifacts.map((artifact) => artifact.visualId)).toEqual([
      "evidence-timeline",
    ]);
  });

  test("automatically retries one transient render failure before returning a passed manifest", async () => {
    const renderAttempts: string[] = [];

    const result = await renderAndPublishVisualArtifacts({
      evidenceLedger: {
        sources: [
          {
            sourceId: "S1",
            title: "Evidence-aware writing assistants",
            sourceType: "study",
            verificationStatus: "verified",
          },
        ],
        claims: [],
        visualMetrics: [
          {
            metricId: "M1",
            label: "Included sources",
            value: 12,
            sourceIds: ["S1"],
          },
        ],
      },
      visualSpecs: [
        {
          visualId: "evidence-timeline",
          visualKind: "timeline",
          title: "Evidence timeline",
          labels: ["2024"],
          dataReferences: [{ referenceType: "metric", referenceId: "M1" }],
          sourceIds: ["S1"],
          metricIds: ["M1"],
          caption: "Publication timeline for verified sources.",
          outputIntent: "final_report_embed",
          displayOrder: 1,
        },
      ],
      renderVisual: async (visualSpec) => {
        renderAttempts.push(visualSpec.visualId);

        if (renderAttempts.length === 1) {
          throw new Error("Sandbox timeout while rendering visual artifact.");
        }

        return {
          visualId: visualSpec.visualId,
          bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
          filename: `${visualSpec.visualId}.png`,
          contentType: "image/png",
        };
      },
      publishVisual: async (rendered, visualSpec) => ({
        artifactId: `artifact_${visualSpec.visualId}`,
        url: `https://utfs.io/f/${rendered.filename}`,
        fileKey: rendered.filename,
      }),
    });

    expect(renderAttempts).toEqual(["evidence-timeline", "evidence-timeline"]);
    expect(result.status).toBe("completed");
    expect(result.events).toEqual([
      expect.objectContaining({
        type: "delivery_retry_started",
        payload: expect.objectContaining({
          attemptNumber: 2,
          phase: "render",
          visualId: "evidence-timeline",
        }),
      }),
      expect.objectContaining({
        type: "delivery_retry_succeeded",
        payload: expect.objectContaining({
          attemptNumber: 2,
          phase: "render",
          visualId: "evidence-timeline",
        }),
      }),
      expect.objectContaining({
        type: "visual_artifact_published",
      }),
    ]);
  });

  test("does not automatically render or publish non-final supporting visual specs as public artifacts", async () => {
    const renderedVisualIds: string[] = [];
    const publishedVisualIds: string[] = [];

    const result = await renderAndPublishVisualArtifacts({
      evidenceLedger: {
        sources: [
          {
            sourceId: "S1",
            title: "Evidence-aware writing assistants",
            sourceType: "study",
            verificationStatus: "verified",
          },
        ],
        claims: [],
        visualMetrics: [
          {
            metricId: "M1",
            label: "Included sources",
            value: 12,
            sourceIds: ["S1"],
          },
        ],
      },
      visualSpecs: [
        {
          visualId: "public-timeline",
          visualKind: "timeline",
          title: "Public timeline",
          labels: ["2024"],
          dataReferences: [{ referenceType: "metric", referenceId: "M1" }],
          sourceIds: ["S1"],
          metricIds: ["M1"],
          caption: "Publication timeline for verified sources.",
          outputIntent: "final_report_embed",
          displayOrder: 1,
        },
        {
          visualId: "audit-only-plot",
          visualKind: "timeline",
          title: "Audit-only plot",
          labels: ["2024"],
          dataReferences: [{ referenceType: "metric", referenceId: "M1" }],
          sourceIds: ["S1"],
          metricIds: ["M1"],
          caption: "Internal audit plot.",
          outputIntent: "audit_only",
          displayOrder: 2,
        },
      ],
      renderVisual: async (visualSpec) => {
        renderedVisualIds.push(visualSpec.visualId);

        return {
          visualId: visualSpec.visualId,
          bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
          filename: `${visualSpec.visualId}.png`,
          contentType: "image/png",
        };
      },
      publishVisual: async (_rendered, visualSpec) => {
        publishedVisualIds.push(visualSpec.visualId);

        return {
          artifactId: `artifact_${visualSpec.visualId}`,
          url: `https://utfs.io/f/${visualSpec.visualId}.png`,
          fileKey: `${visualSpec.visualId}.png`,
        };
      },
    });

    expect(renderedVisualIds).toEqual(["public-timeline"]);
    expect(publishedVisualIds).toEqual(["public-timeline"]);
    expect(result.manifest.artifacts.map((artifact) => artifact.visualId)).toEqual([
      "public-timeline",
    ]);
    expect(result.markdown).toContain("https://utfs.io/f/public-timeline.png");
    expect(result.markdown).not.toContain("audit-only-plot");
  });

  test("trusted skill renderer executes the allowlisted render-vega script and returns PNG bytes for upload", async () => {
    const skill = await createDeepResearchSkillFixture();
    const executorCalls: unknown[] = [];
    const renderer = createTrustedSkillVisualRenderer({
      skill,
      evidenceLedger: {
        sources: [
          {
            sourceId: "S1",
            title: "Evidence-aware writing assistants",
            sourceType: "study",
            verificationStatus: "verified",
          },
        ],
        claims: [],
        visualMetrics: [
          {
            metricId: "M1",
            label: "Included sources",
            value: 12,
            sourceIds: ["S1"],
          },
        ],
      },
      runId: "run_123",
      imageRef: "sha-test",
      executor: {
        async execute(input) {
          executorCalls.push(input);

          return {
            ok: true,
            backend: "fake",
            skillName: input.skillName,
            scriptId: input.script.id,
            runtime: "bun",
            runId: input.runId,
            imageRef: input.imageRef,
            exitCode: 0,
            stdout: "rendered",
            stderr: "",
            artifacts: [
              {
                path: "artifacts/evidence-timeline.png",
                contentType: "image/png",
                byteSize: 8,
                checksum: "checksum",
                role: "visual",
                retrievalStatus: "available",
                bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
              },
            ],
          };
        },
      },
    });

    const rendered = await renderer({
      visualId: "evidence-timeline",
      visualKind: "timeline",
      title: "Evidence timeline",
      labels: ["2024"],
      dataReferences: [{ referenceType: "metric", referenceId: "M1" }],
      sourceIds: ["S1"],
      metricIds: ["M1"],
      claimIds: [],
      caption: "Publication timeline for verified sources.",
      outputIntent: "final_report_embed",
    });

    expect(rendered).toEqual({
      visualId: "evidence-timeline",
      bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      filename: "evidence-timeline.png",
      contentType: "image/png",
    });
    expect(executorCalls).toEqual([
      expect.objectContaining({
        skillName: "deep-research",
        args: expect.arrayContaining(["--spec-json-base64", "--output", "artifacts/evidence-timeline.png"]),
        runId: "run_123",
        imageRef: "sha-test",
        includeArtifactBytes: true,
      }),
    ]);
  });

  test("trusted skill renderer preserves sandbox/dependency error classification", async () => {
    const skill = await createDeepResearchSkillFixture();
    const renderer = createTrustedSkillVisualRenderer({
      skill,
      evidenceLedger: {
        sources: [
          {
            sourceId: "S1",
            title: "Evidence-aware writing assistants",
            sourceType: "study",
            verificationStatus: "verified",
          },
        ],
        claims: [],
        visualMetrics: [
          {
            metricId: "M1",
            label: "Included sources",
            value: 12,
            sourceIds: ["S1"],
          },
        ],
      },
      executor: {
        async execute(input) {
          return {
            ok: false,
            backend: "fake",
            skillName: input.skillName,
            scriptId: input.script.id,
            runtime: "bun",
            runId: input.runId,
            imageRef: input.imageRef,
            exitCode: null,
            stdout: "",
            stderr: "",
            artifacts: [],
            error: {
              code: "sandbox_dependency_failed",
              message: "Renderer dependency installation failed.",
            },
          };
        },
      },
    });

    try {
      await renderer({
        visualId: "evidence-timeline",
        visualKind: "timeline",
        title: "Evidence timeline",
        labels: ["2024"],
        dataReferences: [{ referenceType: "metric", referenceId: "M1" }],
        sourceIds: ["S1"],
        metricIds: ["M1"],
        claimIds: [],
        caption: "Publication timeline for verified sources.",
        outputIntent: "final_report_embed",
      });
    } catch (error) {
      expect(error).toEqual(
        expect.objectContaining({
          errorClass: "dependency",
          errorCode: "sandbox_dependency_failed",
          retryable: false,
        }),
      );
      return;
    }

    throw new Error("Expected trusted renderer to throw a classified error.");
  });

  test("PNG publish adapter uploads rendered bytes and persists artifact manifest metadata", async () => {
    const publishCalls: unknown[] = [];
    const publishVisual = createPngArtifactPublishAdapter({
      async publishArtifact(input) {
        publishCalls.push(input);

        return {
          artifact: {
            id: "artifact_123",
            ownerUserId: "user_123",
            chatThreadId: "thread_123",
            runId: "run_123",
            messageId: null,
            kind: "visual_png",
            title: input.title,
            caption: input.caption ?? null,
            fileKey: "ut_file_123",
            url: "https://utfs.io/f/ut_file_123.png",
            contentType: "image/png",
            byteSize: input.bytes.byteLength,
            checksum: "checksum",
            sourceIds: input.sourceIds ?? [],
            sourceRefs: [],
            visualSpec: input.visualSpec ?? null,
            auditStatus: "passed",
            auditSummary: input.auditSummary ?? null,
            failureSummary: null,
            developerDetail: input.metadata ?? null,
            createdAt: "2026-05-04T00:00:00.000Z",
          },
          markdown: "![Evidence timeline](https://utfs.io/f/ut_file_123.png)",
          upload: {
            fileKey: "ut_file_123",
            url: "https://utfs.io/f/ut_file_123.png",
            name: "evidence-timeline.png",
            size: input.bytes.byteLength,
            contentType: "image/png",
          },
        };
      },
    });

    const published = await publishVisual(
      {
        visualId: "evidence-timeline",
        bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        filename: "evidence-timeline.png",
        contentType: "image/png",
      },
      {
        visualId: "evidence-timeline",
        visualKind: "timeline",
        title: "Evidence timeline",
        labels: ["2024"],
        dataReferences: [{ referenceType: "metric", referenceId: "M1" }],
        sourceIds: ["S1"],
        metricIds: ["M1"],
        claimIds: [],
        caption: "Publication timeline for verified sources.",
        outputIntent: "final_report_embed",
        displayOrder: 1,
      },
    );

    expect(published).toEqual({
      artifactId: "artifact_123",
      url: "https://utfs.io/f/ut_file_123.png",
      fileKey: "ut_file_123",
    });
    expect(publishCalls).toEqual([
      expect.objectContaining({
        filename: "evidence-timeline.png",
        title: "Evidence timeline",
        sourceIds: ["S1"],
        metadata: expect.objectContaining({
          visualId: "evidence-timeline",
          outputIntent: "final_report_embed",
          displayOrder: 1,
          artifactManifestSource: "deep_research_visual_delivery",
        }),
      }),
    ]);
  });
});
