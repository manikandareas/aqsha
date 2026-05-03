from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


VisualKind = Literal[
    "timeline",
    "search_flow",
    "claims_evidence",
    "research_gap_matrix",
    "contributor_chart",
    "source_map",
]

EvidenceStrength = Literal["high", "medium", "low", "insufficient"]


class EvidenceLedger(BaseModel):
    model_config = ConfigDict(extra="allow")

    sources: list[dict[str, Any]] = Field(default_factory=list)
    visual_metrics: list[dict[str, Any]] = Field(default_factory=list)

    @classmethod
    def from_raw(cls, raw: object) -> "EvidenceLedger":
        if isinstance(raw, list):
            return cls(sources=[item for item in raw if isinstance(item, dict)])
        if isinstance(raw, dict):
            return cls.model_validate(raw)
        raise ValueError("evidence ledger must be a list or an object")

    @property
    def source_ids(self) -> set[str]:
        ids: set[str] = set()
        for source in self.sources:
            value = source.get("source_id") or source.get("id")
            if isinstance(value, str) and value.strip():
                ids.add(value)
        return ids

    @property
    def metric_ids(self) -> set[str]:
        ids: set[str] = set()
        for metric in self.visual_metrics:
            value = metric.get("metric_id") or metric.get("id")
            if isinstance(value, str) and value.strip():
                ids.add(value)
        return ids


class MetricValue(BaseModel):
    metric_id: str | None = None
    value: float | int


class BaseVisual(BaseModel):
    model_config = ConfigDict(extra="forbid")

    visual_id: str
    kind: VisualKind
    title: str
    caption: str
    source_ids: list[str] = Field(default_factory=list)

    @field_validator("visual_id", "title", "caption")
    @classmethod
    def require_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("value must not be empty")
        return value


class TimelineItem(BaseModel):
    label: str
    year: int
    source_ids: list[str] = Field(default_factory=list)
    citation_count: MetricValue | None = None


class TimelineVisual(BaseVisual):
    kind: Literal["timeline"]
    items: list[TimelineItem]


class SearchFlowStage(BaseModel):
    label: str
    count: MetricValue


class SearchFlowVisual(BaseVisual):
    kind: Literal["search_flow"]
    stages: list[SearchFlowStage]


class ClaimsEvidenceRow(BaseModel):
    claim: str
    evidence_strength: EvidenceStrength
    reasoning: str
    supporting_sources: list[str]


class ClaimsEvidenceVisual(BaseVisual):
    kind: Literal["claims_evidence"]
    rows: list[ClaimsEvidenceRow]


class GapMatrixCell(BaseModel):
    row_label: str
    column_label: str
    value: MetricValue


class ResearchGapMatrixVisual(BaseVisual):
    kind: Literal["research_gap_matrix"]
    rows: list[str]
    columns: list[str]
    cells: list[GapMatrixCell]


class ContributorItem(BaseModel):
    label: str
    count: MetricValue


class ContributorChartVisual(BaseVisual):
    kind: Literal["contributor_chart"]
    contributors: list[ContributorItem]


class SourceMapNode(BaseModel):
    source_id: str
    label: str


class SourceMapLink(BaseModel):
    source_id: str
    target_source_id: str


class SourceMapVisual(BaseVisual):
    kind: Literal["source_map"]
    nodes: list[SourceMapNode]
    links: list[SourceMapLink] = Field(default_factory=list)


Visual = (
    TimelineVisual
    | SearchFlowVisual
    | ClaimsEvidenceVisual
    | ResearchGapMatrixVisual
    | ContributorChartVisual
    | SourceMapVisual
)


class VisualSpec(BaseModel):
    visuals: list[Visual] = Field(default_factory=list, discriminator="kind")


class VisualIssue(BaseModel):
    visual_id: str
    message: str


class VisualAuditReport(BaseModel):
    failed_visual_ids: list[str]
    issues: list[VisualIssue]


class ArtifactRecord(BaseModel):
    visual_id: str
    kind: VisualKind
    title: str
    caption: str
    source_ids: list[str] = Field(default_factory=list)
    path: str | None = None
    audit_status: Literal["passed", "failed"]
    issues: list[str] = Field(default_factory=list)


class ArtifactManifest(BaseModel):
    artifacts: list[ArtifactRecord]


def audit_visual_spec(evidence: EvidenceLedger, spec: VisualSpec) -> VisualAuditReport:
    issues: list[VisualIssue] = []
    seen_visual_ids: set[str] = set()

    for visual in spec.visuals:
        if visual.visual_id in seen_visual_ids:
            issues.append(VisualIssue(visual_id=visual.visual_id, message="Duplicate visual_id."))
        seen_visual_ids.add(visual.visual_id)

        for source_id in _visual_source_ids(visual):
            if source_id not in evidence.source_ids:
                issues.append(VisualIssue(visual_id=visual.visual_id, message=f"Unknown source_id: {source_id}"))

        for metric_id in _visual_metric_ids(visual):
            if metric_id not in evidence.metric_ids:
                issues.append(VisualIssue(visual_id=visual.visual_id, message=f"Unknown metric_id: {metric_id}"))

        _audit_visual_shape(visual, issues)

    failed = sorted({issue.visual_id for issue in issues})
    return VisualAuditReport(failed_visual_ids=failed, issues=issues)


def compose_visual_markdown(manifest: ArtifactManifest) -> str:
    sections: list[str] = []
    for artifact in manifest.artifacts:
        if artifact.audit_status != "passed" or not artifact.path:
            continue
        sections.append(f"## {artifact.title}\n\n![{artifact.title}]({artifact.path})\n\n{artifact.caption}")
    return "\n\n".join(sections).strip() + ("\n" if sections else "")


def _visual_source_ids(visual: Visual) -> set[str]:
    ids = set(visual.source_ids)
    if isinstance(visual, TimelineVisual):
        for item in visual.items:
            ids.update(item.source_ids)
    elif isinstance(visual, ClaimsEvidenceVisual):
        for row in visual.rows:
            ids.update(row.supporting_sources)
    elif isinstance(visual, SourceMapVisual):
        for node in visual.nodes:
            ids.add(node.source_id)
        for link in visual.links:
            ids.add(link.source_id)
            ids.add(link.target_source_id)
    return {source_id for source_id in ids if source_id}


def _visual_metric_ids(visual: Visual) -> set[str]:
    metric_ids: set[str] = set()

    def add(value: MetricValue | None) -> None:
        if value and value.metric_id:
            metric_ids.add(value.metric_id)

    if isinstance(visual, TimelineVisual):
        for item in visual.items:
            add(item.citation_count)
    elif isinstance(visual, SearchFlowVisual):
        for stage in visual.stages:
            add(stage.count)
    elif isinstance(visual, ResearchGapMatrixVisual):
        for cell in visual.cells:
            add(cell.value)
    elif isinstance(visual, ContributorChartVisual):
        for contributor in visual.contributors:
            add(contributor.count)

    return metric_ids


def _audit_visual_shape(visual: Visual, issues: list[VisualIssue]) -> None:
    if isinstance(visual, TimelineVisual) and not visual.items:
        issues.append(VisualIssue(visual_id=visual.visual_id, message="Timeline requires at least one item."))
    elif isinstance(visual, SearchFlowVisual) and not visual.stages:
        issues.append(VisualIssue(visual_id=visual.visual_id, message="Search flow requires at least one stage."))
    elif isinstance(visual, ClaimsEvidenceVisual) and not visual.rows:
        issues.append(VisualIssue(visual_id=visual.visual_id, message="Claims evidence visual requires at least one row."))
    elif isinstance(visual, ResearchGapMatrixVisual):
        if not visual.rows or not visual.columns or not visual.cells:
            issues.append(VisualIssue(visual_id=visual.visual_id, message="Gap matrix requires rows, columns, and cells."))
        for cell in visual.cells:
            if cell.row_label not in visual.rows:
                issues.append(VisualIssue(visual_id=visual.visual_id, message=f"Unknown matrix row: {cell.row_label}"))
            if cell.column_label not in visual.columns:
                issues.append(VisualIssue(visual_id=visual.visual_id, message=f"Unknown matrix column: {cell.column_label}"))
    elif isinstance(visual, ContributorChartVisual) and not visual.contributors:
        issues.append(VisualIssue(visual_id=visual.visual_id, message="Contributor chart requires at least one contributor."))
    elif isinstance(visual, SourceMapVisual) and not visual.nodes:
        issues.append(VisualIssue(visual_id=visual.visual_id, message="Source map requires at least one node."))
