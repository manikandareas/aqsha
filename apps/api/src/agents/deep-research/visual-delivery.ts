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

type VisualDeliveryEvent = {
  type: string;
  scope: "run" | "tool" | "error";
  status: "completed" | "failed";
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
    const rendered = await input.renderVisual(visualSpec);
    const published = await input.publishVisual(rendered, visualSpec);

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
      throw new Error(resolved.error.message);
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
      throw new Error(result.error.message);
    }

    const artifact = result.artifacts.find(
      (candidate) =>
        candidate.contentType === "image/png" &&
        candidate.role === "visual" &&
        candidate.bytes,
    );

    if (!artifact?.bytes) {
      throw new Error("Trusted render script did not return PNG artifact bytes.");
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
