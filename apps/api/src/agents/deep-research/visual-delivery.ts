import { auditVisualSpecReferences } from "./audit";
import {
  artifactManifestSchema,
  type EvidenceSource,
  visualSpecSchema,
  type ArtifactManifest,
  type ArtifactManifestRecord,
  type EvidenceLedger,
  type VisualMetric,
  type VisualSpec,
} from "./contracts";
import {
  LocalScriptExecutor,
  loadSkillScriptManifest,
  resolveSkillScript,
  type SkillScriptExecutor,
} from "../skills";
import type { SkillMetadata } from "../skills";
import type { CreateChatResponseInput } from "../../modules/agents/model";
import {
  ClassifiedResearchError,
  classifyResearchError,
  classifyTrustedScriptError,
  type ResearchErrorClass,
} from "./errors";

export type VisualDeliveryEvent = {
  type: string;
  scope: "run" | "tool" | "error";
  status: "running" | "completed" | "failed";
  title: string;
  summary: string;
  payload: Record<string, unknown>;
};

export type RenderedVisualArtifact = {
  visualId: string;
  bytes: Uint8Array;
  filename: string;
  contentType: "image/png";
};

export type PublishedVisualArtifact = {
  artifactId: string;
  url: string;
  fileKey: string;
};

export type RenderAndPublishVisualArtifactsInput = {
  evidenceLedger: EvidenceLedger;
  visualSpecs: unknown[];
  renderVisual: (visualSpec: VisualSpec) => Promise<RenderedVisualArtifact>;
  publishVisual: (
    rendered: RenderedVisualArtifact,
    visualSpec: VisualSpec,
  ) => Promise<PublishedVisualArtifact>;
};

export type RetryVisualArtifactDeliveryInput =
  RenderAndPublishVisualArtifactsInput & {
    attemptNumber: number;
    phase: "render" | "upload";
    visualId?: string;
    originalArtifactId?: string;
  };

export type TrustedSkillVisualRendererOptions = {
  skill: SkillMetadata;
  evidenceLedger: EvidenceLedger;
  executor?: SkillScriptExecutor;
  runId?: string;
  imageRef?: string;
};

export type PngArtifactPublishAdapterOptions = {
  publishArtifact: NonNullable<CreateChatResponseInput["onArtifact"]>;
};

export type RenderAndPublishVisualArtifactsResult = {
  status: "completed" | "failed";
  manifest: ArtifactManifest;
  markdown: string;
  events: VisualDeliveryEvent[];
};

export async function renderAndPublishVisualArtifacts(
  input: RenderAndPublishVisualArtifactsInput,
): Promise<RenderAndPublishVisualArtifactsResult> {
  const visualSpecs: VisualSpec[] = [];

  for (const rawVisualSpec of input.visualSpecs) {
    const parsed = visualSpecSchema.safeParse(rawVisualSpec);
    if (!parsed.success) {
      return visualSpecValidationFailure({
        summary: "Visual Spec failed schema validation.",
        developerDetail: parsed.error.issues,
      });
    }

    const referenceIssues = auditVisualSpecReferences(parsed.data, input.evidenceLedger);
    if (referenceIssues.length > 0) {
      return visualSpecValidationFailure({
        summary: "Visual Spec references data that is missing from the Evidence Ledger.",
        developerDetail: referenceIssues,
      });
    }

    visualSpecs.push(parsed.data);
  }

  const artifacts: ArtifactManifestRecord[] = [];
  const events: VisualDeliveryEvent[] = [];

  for (const visualSpec of visualSpecs.filter(
    (candidate) => candidate.outputIntent === "final_report_embed",
  )) {
    let rendered: RenderedVisualArtifact;

    try {
      rendered = await input.renderVisual(visualSpec);
    } catch (error) {
      if (isTransientDeliveryFailure(error)) {
        events.push(createDeliveryRetryStartedEvent({
          phase: "render",
          visualSpec,
        }));

        try {
          rendered = await input.renderVisual(visualSpec);
          events.push(createDeliveryRetrySucceededEvent({
            phase: "render",
            visualSpec,
          }));
        } catch (retryError) {
          return visualArtifactFailure({
            visualSpec,
            error: retryError,
            stage: "render",
            leadingEvents: [
              ...events,
              createDeliveryRetryFailedEvent({
                phase: "render",
                visualSpec,
              }),
            ],
          });
        }
      } else {
        return visualArtifactFailure({
          visualSpec,
          error,
          stage: "render",
        });
      }
    }

    let published: PublishedVisualArtifact;

    try {
      published = await input.publishVisual(rendered, visualSpec);
    } catch (error) {
      if (isTransientDeliveryFailure(error)) {
        events.push(createDeliveryRetryStartedEvent({
          phase: "upload",
          visualSpec,
        }));

        try {
          published = await input.publishVisual(rendered, visualSpec);
          events.push(createDeliveryRetrySucceededEvent({
            phase: "upload",
            visualSpec,
          }));
        } catch (retryError) {
          return visualArtifactFailure({
            visualSpec,
            error: retryError,
            stage: "upload",
            leadingEvents: [
              ...events,
              createDeliveryRetryFailedEvent({
                phase: "upload",
                visualSpec,
              }),
            ],
          });
        }
      } else {
        return visualArtifactFailure({
          visualSpec,
          error,
          stage: "upload",
        });
      }
    }

    artifacts.push({
      artifactId: published.artifactId,
      visualId: visualSpec.visualId,
      status: "passed",
      title: visualSpec.title,
      caption: visualSpec.caption,
      outputIntent: visualSpec.outputIntent,
      contentType: "image/png",
      url: published.url,
      fileKey: published.fileKey,
      sourceIds: visualSpec.sourceIds,
      metricIds: visualSpec.metricIds,
      displayOrder: visualSpec.displayOrder,
      metadata: {
        rendererContentType: rendered.contentType,
        rendererFilename: rendered.filename,
      },
    });
    events.push({
      type: "visual_artifact_published",
      scope: "tool",
      status: "completed",
      title: "Visual artifact published",
      summary: `${visualSpec.title} was rendered, published, and added to the Artifact Manifest.`,
      payload: {
        artifactId: published.artifactId,
        visualId: visualSpec.visualId,
        sourceIds: visualSpec.sourceIds,
        metricIds: visualSpec.metricIds,
      },
    });
  }

  const manifest = artifactManifestSchema.parse({ artifacts });

  return {
    status: "completed",
    manifest,
    markdown: createFinalVisualArtifactsMarkdown(manifest),
    events,
  };
}

export async function retryVisualArtifactDelivery(
  input: RetryVisualArtifactDeliveryInput,
): Promise<RenderAndPublishVisualArtifactsResult> {
  const retryPayload = {
    attemptNumber: input.attemptNumber,
    phase: input.phase,
    visualId: input.visualId ?? null,
    originalArtifactId: input.originalArtifactId ?? null,
  };
  const result = await renderAndPublishVisualArtifacts({
    evidenceLedger: input.evidenceLedger,
    visualSpecs: input.visualId
      ? input.visualSpecs.filter((visualSpec) => {
          const record = visualSpec as Record<string, unknown>;

          return record.visualId === input.visualId;
        })
      : input.visualSpecs,
    renderVisual: input.renderVisual,
    publishVisual: input.publishVisual,
  });
  const terminalEvent: VisualDeliveryEvent =
    result.status === "completed"
      ? {
          type: "delivery_retry_succeeded",
          scope: "run",
          status: "completed",
          title: "Delivery retry succeeded",
          summary: "Visual artifact delivery retry completed.",
          payload: retryPayload,
        }
      : {
          type: "delivery_retry_failed",
          scope: "error",
          status: "failed",
          title: "Delivery retry failed",
          summary: "Visual artifact delivery retry failed.",
          payload: {
            ...retryPayload,
            failureStatus: result.status,
          },
        };

  return {
    ...result,
    events: [
      {
        type: "delivery_retry_started",
        scope: "run",
        status: "running",
        title: "Delivery retry started",
        summary: "Retrying visual artifact delivery from existing research lineage.",
        payload: retryPayload,
      },
      ...result.events,
      terminalEvent,
    ],
  };
}

export function createTrustedSkillVisualRenderer({
  skill,
  evidenceLedger,
  executor = new LocalScriptExecutor(),
  runId,
  imageRef,
}: TrustedSkillVisualRendererOptions): RenderAndPublishVisualArtifactsInput["renderVisual"] {
  return async (visualSpec) => {
    const manifest = await loadSkillScriptManifest(skill);
    const resolved = await resolveSkillScript({
      skill,
      manifest,
      scriptId: "render-vega",
    });

    if (!resolved.ok) {
      throw classifyTrustedScriptError(resolved.error);
    }

    const filename = `${filenameSafeVisualId(visualSpec.visualId)}.png`;
    const vegaLiteSpec = buildVegaLiteSpec(visualSpec, evidenceLedger);
    const specJsonBase64 = Buffer.from(JSON.stringify(vegaLiteSpec), "utf8").toString("base64");
    const result = await executor.execute({
      skillName: skill.name,
      script: resolved.script,
      args: [
        "--spec-json-base64",
        specJsonBase64,
        "--output",
        `artifacts/${filename}`,
      ],
      runId,
      imageRef,
      includeArtifactBytes: true,
    });

    if (!result.ok) {
      throw classifyTrustedScriptError(result.error);
    }

    const artifact = result.artifacts.find(
      (candidate) =>
        candidate.contentType === "image/png" &&
        candidate.role === "visual" &&
        candidate.bytes,
    );

    if (!artifact?.bytes) {
      throw new ClassifiedResearchError({
        errorClass: "render",
        errorCode: "artifact_missing",
        message: "Trusted render script did not return PNG artifact bytes.",
      });
    }

    return {
      visualId: visualSpec.visualId,
      bytes: artifact.bytes,
      filename,
      contentType: "image/png",
    };
  };
}

export function createPngArtifactPublishAdapter({
  publishArtifact,
}: PngArtifactPublishAdapterOptions): RenderAndPublishVisualArtifactsInput["publishVisual"] {
  return async (rendered, visualSpec) => {
    const published = await publishArtifact({
      bytes: rendered.bytes,
      filename: rendered.filename,
      title: visualSpec.title,
      altText: visualSpec.title,
      caption: visualSpec.caption,
      sourceIds: visualSpec.sourceIds,
      visualSpec,
      auditSummary: "Visual artifact references verified Evidence Ledger IDs and passed pre-render validation.",
      metadata: {
        visualId: visualSpec.visualId,
        outputIntent: visualSpec.outputIntent,
        displayOrder: visualSpec.displayOrder ?? null,
        rendererFilename: rendered.filename,
        rendererContentType: rendered.contentType,
        artifactManifestSource: "deep_research_visual_delivery",
      },
    });

    return {
      artifactId: published.artifact.id,
      url: published.artifact.url ?? published.upload.url,
      fileKey: published.artifact.fileKey ?? published.upload.fileKey,
    };
  };
}

export function createFinalVisualArtifactsMarkdown(manifest: ArtifactManifest): string {
  return [...manifest.artifacts]
    .filter(isPassedFinalReportArtifact)
    .sort(compareArtifactDisplayOrder)
    .map((artifact) => {
      const image = `![${escapeMarkdownAlt(artifact.title)}](${artifact.url})`;
      return `${image}\n\n_${escapeMarkdownCaption(artifact.caption)}_`;
    })
    .join("\n\n");
}

function isPassedFinalReportArtifact(
  artifact: ArtifactManifestRecord,
): artifact is Extract<ArtifactManifestRecord, { status: "passed" }> {
  return artifact.status === "passed" && artifact.outputIntent === "final_report_embed";
}

function compareArtifactDisplayOrder(
  left: ArtifactManifestRecord,
  right: ArtifactManifestRecord,
): number {
  return (left.displayOrder ?? Number.MAX_SAFE_INTEGER) - (right.displayOrder ?? Number.MAX_SAFE_INTEGER);
}

function escapeMarkdownAlt(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/]/g, "\\]");
}

function escapeMarkdownCaption(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/_/g, "\\_");
}

function buildVegaLiteSpec(visualSpec: VisualSpec, evidenceLedger: EvidenceLedger): Record<string, unknown> {
  const metricsById = new Map(evidenceLedger.visualMetrics.map((metric) => [metric.metricId, metric]));
  const sourceTitlesById = new Map(evidenceLedger.sources.map((source) => [source.sourceId, source.title]));
  const records = visualSpec.metricIds
    .map((metricId, index) => metricRecord(metricId, index, metricsById, sourceTitlesById))
    .filter((record): record is Record<string, unknown> => record !== null);

  if (records.length === 0) {
    throw new Error("Visual Spec has no renderable numeric visual metrics.");
  }

  return {
    $schema: "https://vega.github.io/schema/vega-lite/v6.json",
    title: visualSpec.title,
    width: 720,
    height: 360,
    data: {
      values: records,
    },
    mark: visualSpec.visualKind === "timeline" ? "point" : "bar",
    encoding: {
      x: {
        field: "label",
        type: "nominal",
        sort: null,
        axis: { labelAngle: -25 },
      },
      y: {
        field: "value",
        type: "quantitative",
      },
      tooltip: [
        { field: "label", type: "nominal" },
        { field: "value", type: "quantitative" },
        { field: "unit", type: "nominal" },
        { field: "sources", type: "nominal" },
      ],
    },
  };
}

function metricRecord(
  metricId: string,
  index: number,
  metricsById: Map<string, VisualMetric>,
  sourceTitlesById: Map<string, EvidenceSource["title"]>,
): Record<string, unknown> | null {
  const metric = metricsById.get(metricId);

  if (!metric || typeof metric.value !== "number") {
    return null;
  }

  return {
    label: metric.label || metric.metricId || `Metric ${index + 1}`,
    value: metric.value,
    unit: metric.unit ?? "",
    sources: metric.sourceIds
      .map((sourceId) => sourceTitlesById.get(sourceId) ?? sourceId)
      .join(", "),
  };
}

function filenameSafeVisualId(visualId: string): string {
  return visualId.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "visual";
}

function visualSpecValidationFailure({
  summary,
  developerDetail,
}: {
  summary: string;
  developerDetail: unknown;
}): RenderAndPublishVisualArtifactsResult {
  const metadata = {
    errorClass: "validation",
    errorCode: "invalid_visual_spec",
    developerDetail,
  };

  return {
    status: "failed",
    manifest: artifactManifestSchema.parse({
      artifacts: [],
      metadata,
    }),
    markdown: "",
    events: [
      {
        type: "visual_spec_validation_failed",
        scope: "error",
        status: "failed",
        title: "Visual Spec validation failed",
        summary,
        payload: metadata,
      },
    ],
  };
}

function visualArtifactFailure({
  visualSpec,
  error,
  stage,
  leadingEvents = [],
}: {
  visualSpec: VisualSpec;
  error: unknown;
  stage: "render" | "upload";
  leadingEvents?: VisualDeliveryEvent[];
}): RenderAndPublishVisualArtifactsResult {
  const classified = classifyResearchError(
    error,
    errorClassForDeliveryStage(stage),
    stage === "render" ? "visual_artifact_render_failed" : "visual_artifact_upload_failed",
  );
  const errorClass = classified.errorClass;
  const eventType =
    stage === "render"
      ? "visual_artifact_render_failed"
      : "visual_artifact_upload_failed";
  const title =
    stage === "render"
      ? "Visual artifact render failed"
      : "Visual artifact upload failed";
  const summary =
    stage === "render"
      ? "Visual artifact render failed. You can retry delivery."
      : "Visual artifact upload failed. You can retry delivery.";
  const metadata = {
    errorClass,
    errorCode: classified.errorCode,
    retryable: classified.retryable,
    developerDetail: classified.developerDetail,
  };
  const artifact = {
    artifactId: `failed_${filenameSafeVisualId(visualSpec.visualId)}`,
    visualId: visualSpec.visualId,
    status: "failed" as const,
    title: visualSpec.title,
    caption: visualSpec.caption,
    outputIntent: visualSpec.outputIntent,
    contentType: "image/png" as const,
    sourceIds: visualSpec.sourceIds,
    metricIds: visualSpec.metricIds,
    displayOrder: visualSpec.displayOrder,
    reason: summary,
    metadata: {
      ...metadata,
      stage,
    },
  };

  return {
    status: "failed",
    manifest: artifactManifestSchema.parse({
      artifacts: [artifact],
      metadata,
    }),
    markdown: "",
    events: [
      ...leadingEvents,
      {
        type: eventType,
        scope: "error",
        status: "failed",
        title,
        summary,
        payload: {
          ...metadata,
          visualId: visualSpec.visualId,
          sourceIds: visualSpec.sourceIds,
          metricIds: visualSpec.metricIds,
        },
      },
    ],
  };
}

function createDeliveryRetryStartedEvent({
  phase,
  visualSpec,
}: {
  phase: "render" | "upload";
  visualSpec: VisualSpec;
}): VisualDeliveryEvent {
  return {
    type: "delivery_retry_started",
    scope: "run",
    status: "running",
    title: "Delivery retry started",
    summary: "Retrying visual artifact delivery from existing research lineage.",
    payload: {
      attemptNumber: 2,
      phase,
      visualId: visualSpec.visualId,
      originalArtifactId: `failed_${filenameSafeVisualId(visualSpec.visualId)}`,
    },
  };
}

function createDeliveryRetrySucceededEvent({
  phase,
  visualSpec,
}: {
  phase: "render" | "upload";
  visualSpec: VisualSpec;
}): VisualDeliveryEvent {
  return {
    type: "delivery_retry_succeeded",
    scope: "run",
    status: "completed",
    title: "Delivery retry succeeded",
    summary: "Visual artifact delivery retry completed.",
    payload: {
      attemptNumber: 2,
      phase,
      visualId: visualSpec.visualId,
      originalArtifactId: `failed_${filenameSafeVisualId(visualSpec.visualId)}`,
    },
  };
}

function createDeliveryRetryFailedEvent({
  phase,
  visualSpec,
}: {
  phase: "render" | "upload";
  visualSpec: VisualSpec;
}): VisualDeliveryEvent {
  return {
    type: "delivery_retry_failed",
    scope: "error",
    status: "failed",
    title: "Delivery retry failed",
    summary: "Visual artifact delivery retry failed.",
    payload: {
      attemptNumber: 2,
      phase,
      visualId: visualSpec.visualId,
      originalArtifactId: `failed_${filenameSafeVisualId(visualSpec.visualId)}`,
    },
  };
}

function isTransientDeliveryFailure(error: unknown): boolean {
  if (error instanceof ClassifiedResearchError) {
    return (
      error.errorCode === "timeout" ||
      error.errorCode === "artifact_retrieval_failed" ||
      error.errorCode === "sandbox_create_failed"
    );
  }

  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();

  return (
    normalized.includes("timeout") ||
    normalized.includes("temporary") ||
    normalized.includes("temporarily") ||
    normalized.includes("artifact retrieval")
  );
}

function errorClassForDeliveryStage(stage: "render" | "upload"): ResearchErrorClass {
  return stage === "render" ? "render" : "uploadthing";
}
