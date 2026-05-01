from __future__ import annotations

from collections.abc import Sequence
from typing import Annotated, Literal, cast

from pydantic import BaseModel, ConfigDict, Field, field_validator

EvidenceStrength = Literal["high", "medium", "low", "insufficient"]
AuditStatus = Literal["passed", "failed", "omitted"]


class EvidenceMetric(BaseModel):
    model_config = ConfigDict(extra="allow")

    metric_id: str
    value: int | float
    unit: str | None = None
    context: str | None = None
    source_ids: list[str] = Field(default_factory=list[str])


class EvidenceSource(BaseModel):
    model_config = ConfigDict(extra="allow")

    source_id: str
    title: str | None = None
    authors_or_organization: str | None = None
    year: int | None = None
    date_published: str | None = None
    source_type: str | None = None
    journal_or_publisher: str | None = None
    topics: list[str] = Field(default_factory=list[str])
    verification_status: str | None = None


class EvidenceClaim(BaseModel):
    model_config = ConfigDict(extra="allow")

    claim_id: str
    claim_text: str
    supporting_sources: list[str] = Field(default_factory=list[str])
    counterevidence: list[str] = Field(default_factory=list[str])
    evidence_strength: EvidenceStrength | None = None
    confidence: EvidenceStrength | None = None
    verification_status: str | None = None


class EvidenceLedger(BaseModel):
    model_config = ConfigDict(extra="allow")

    sources: list[EvidenceSource] = Field(default_factory=list[EvidenceSource])
    claims: list[EvidenceClaim] = Field(default_factory=list[EvidenceClaim])
    visual_metrics: list[EvidenceMetric] = Field(default_factory=list[EvidenceMetric])

    @classmethod
    def from_raw(cls, raw: object) -> EvidenceLedger:
        if isinstance(raw, list):
            return cls.model_validate({"sources": raw})
        if isinstance(raw, dict):
            data = cast(dict[str, object], raw.copy())
            if "claim_records" in data and "claims" not in data:
                data["claims"] = data["claim_records"]
            if "metrics" in data and "visual_metrics" not in data:
                data["visual_metrics"] = data["metrics"]
            return cls.model_validate(data)
        raise ValueError("evidence ledger must be a list or an object")

    def source_ids(self) -> set[str]:
        return {source.source_id for source in self.sources}

    def metric_values(self) -> dict[str, int | float]:
        return {metric.metric_id: metric.value for metric in self.visual_metrics}


class MetricBackedNumber(BaseModel):
    metric_id: str
    value: int | float


class VisualBase(BaseModel):
    visual_id: str
    title: str
    caption: str
    source_ids: list[str] = Field(default_factory=list[str])

    @field_validator("visual_id")
    @classmethod
    def validate_visual_id(cls, value: str) -> str:
        clean = value.strip()
        if not clean:
            raise ValueError("visual_id is required")
        return clean


class TimelineItem(BaseModel):
    label: str
    year: int
    source_ids: list[str]
    citation_count: MetricBackedNumber | None = None
    evidence_weight: MetricBackedNumber | None = None


class TimelineVisual(VisualBase):
    kind: Literal["timeline"]
    items: list[TimelineItem]


class SearchFlowStage(BaseModel):
    label: str
    count: MetricBackedNumber
    source_ids: list[str] = Field(default_factory=list[str])


class SearchFlowVisual(VisualBase):
    kind: Literal["search_flow"]
    stages: list[SearchFlowStage]


class ClaimEvidenceRow(BaseModel):
    claim_id: str
    claim: str
    evidence_strength: EvidenceStrength
    reasoning: str
    supporting_sources: list[str]
    counterevidence: list[str] = Field(default_factory=list[str])


class ClaimsEvidenceVisual(VisualBase):
    kind: Literal["claims_evidence"]
    rows: list[ClaimEvidenceRow]


class GapMatrixCell(BaseModel):
    row_label: str
    column_label: str
    value: MetricBackedNumber
    source_ids: list[str] = Field(default_factory=list[str])


class ResearchGapMatrixVisual(VisualBase):
    kind: Literal["research_gap_matrix"]
    rows: list[str]
    columns: list[str]
    cells: list[GapMatrixCell]


class ContributorItem(BaseModel):
    label: str
    category: Literal["author", "organization", "journal", "publisher", "other"]
    count: MetricBackedNumber
    source_ids: list[str]


class ContributorChartVisual(VisualBase):
    kind: Literal["contributor_chart"]
    contributors: list[ContributorItem]


class SourceMapNode(BaseModel):
    source_id: str
    label: str
    category: str


class SourceMapLink(BaseModel):
    source_id: str
    target_source_id: str
    relation: str


class SourceMapVisual(VisualBase):
    kind: Literal["source_map"]
    nodes: list[SourceMapNode]
    links: list[SourceMapLink] = Field(default_factory=list[SourceMapLink])


VisualArtifact = Annotated[
    TimelineVisual
    | SearchFlowVisual
    | ClaimsEvidenceVisual
    | ResearchGapMatrixVisual
    | ContributorChartVisual
    | SourceMapVisual,
    Field(discriminator="kind"),
]


class VisualSpec(BaseModel):
    visuals: list[VisualArtifact]


class VisualIssue(BaseModel):
    visual_id: str
    code: str
    message: str


class VisualAuditReport(BaseModel):
    passed_visual_ids: list[str]
    failed_visual_ids: list[str]
    issues: list[VisualIssue]


class ArtifactRecord(BaseModel):
    visual_id: str
    kind: str
    title: str
    caption: str
    path: str | None = None
    source_ids: list[str] = Field(default_factory=list)
    audit_status: AuditStatus
    issues: list[str] = Field(default_factory=list[str])


class ArtifactManifest(BaseModel):
    artifacts: list[ArtifactRecord]


def audit_visual_spec(evidence: EvidenceLedger, spec: VisualSpec) -> VisualAuditReport:
    known_sources = evidence.source_ids()
    known_metrics = evidence.metric_values()
    issues: list[VisualIssue] = []

    for visual in spec.visuals:
        _audit_common_visual_fields(visual, known_sources, issues)

        if isinstance(visual, TimelineVisual):
            _audit_timeline_visual(visual, known_sources, known_metrics, issues)
        elif isinstance(visual, SearchFlowVisual):
            _audit_search_flow_visual(visual, known_sources, known_metrics, issues)
        elif isinstance(visual, ClaimsEvidenceVisual):
            _audit_claims_evidence_visual(visual, known_sources, issues)
        elif isinstance(visual, ResearchGapMatrixVisual):
            _audit_gap_matrix_visual(visual, known_sources, known_metrics, issues)
        elif isinstance(visual, ContributorChartVisual):
            _audit_contributor_visual(visual, known_sources, known_metrics, issues)
        else:
            _audit_source_map_visual(visual, known_sources, issues)

    failed = sorted({issue.visual_id for issue in issues})
    passed = [visual.visual_id for visual in spec.visuals if visual.visual_id not in failed]
    return VisualAuditReport(
        passed_visual_ids=passed,
        failed_visual_ids=failed,
        issues=issues,
    )


def _audit_common_visual_fields(
    visual: VisualBase,
    known_sources: set[str],
    issues: list[VisualIssue],
) -> None:
    _audit_sources(visual.visual_id, "source_ids", visual.source_ids, known_sources, issues)
    _audit_nonempty(visual.visual_id, "title", visual.title, issues)
    _audit_nonempty(visual.visual_id, "caption", visual.caption, issues)


def _audit_timeline_visual(
    visual: TimelineVisual,
    known_sources: set[str],
    known_metrics: dict[str, int | float],
    issues: list[VisualIssue],
) -> None:
    _audit_collection(visual.visual_id, "items", visual.items, issues)
    for index, item in enumerate(visual.items):
        _audit_sources(
            visual.visual_id,
            f"items[{index}].source_ids",
            item.source_ids,
            known_sources,
            issues,
        )
        _audit_metric(
            visual.visual_id,
            f"items[{index}].citation_count",
            item.citation_count,
            known_metrics,
            issues,
        )
        _audit_metric(
            visual.visual_id,
            f"items[{index}].evidence_weight",
            item.evidence_weight,
            known_metrics,
            issues,
        )


def _audit_search_flow_visual(
    visual: SearchFlowVisual,
    known_sources: set[str],
    known_metrics: dict[str, int | float],
    issues: list[VisualIssue],
) -> None:
    _audit_collection(visual.visual_id, "stages", visual.stages, issues)
    for index, stage in enumerate(visual.stages):
        _audit_sources(
            visual.visual_id,
            f"stages[{index}].source_ids",
            stage.source_ids,
            known_sources,
            issues,
        )
        _audit_metric(
            visual.visual_id,
            f"stages[{index}].count",
            stage.count,
            known_metrics,
            issues,
        )


def _audit_claims_evidence_visual(
    visual: ClaimsEvidenceVisual,
    known_sources: set[str],
    issues: list[VisualIssue],
) -> None:
    _audit_collection(visual.visual_id, "rows", visual.rows, issues)
    for index, row in enumerate(visual.rows):
        _audit_sources(
            visual.visual_id,
            f"rows[{index}].supporting_sources",
            row.supporting_sources,
            known_sources,
            issues,
        )
        _audit_sources(
            visual.visual_id,
            f"rows[{index}].counterevidence",
            row.counterevidence,
            known_sources,
            issues,
        )


def _audit_gap_matrix_visual(
    visual: ResearchGapMatrixVisual,
    known_sources: set[str],
    known_metrics: dict[str, int | float],
    issues: list[VisualIssue],
) -> None:
    _audit_collection(visual.visual_id, "rows", visual.rows, issues)
    _audit_collection(visual.visual_id, "columns", visual.columns, issues)
    _audit_collection(visual.visual_id, "cells", visual.cells, issues)
    for index, cell in enumerate(visual.cells):
        if cell.row_label not in visual.rows:
            _add_issue(
                issues,
                visual.visual_id,
                "unknown_row",
                f"cells[{index}].row_label is not declared in rows",
            )
        if cell.column_label not in visual.columns:
            _add_issue(
                issues,
                visual.visual_id,
                "unknown_column",
                f"cells[{index}].column_label is not declared in columns",
            )
        _audit_sources(
            visual.visual_id,
            f"cells[{index}].source_ids",
            cell.source_ids,
            known_sources,
            issues,
        )
        _audit_metric(
            visual.visual_id,
            f"cells[{index}].value",
            cell.value,
            known_metrics,
            issues,
        )


def _audit_contributor_visual(
    visual: ContributorChartVisual,
    known_sources: set[str],
    known_metrics: dict[str, int | float],
    issues: list[VisualIssue],
) -> None:
    _audit_collection(visual.visual_id, "contributors", visual.contributors, issues)
    for index, contributor in enumerate(visual.contributors):
        _audit_sources(
            visual.visual_id,
            f"contributors[{index}].source_ids",
            contributor.source_ids,
            known_sources,
            issues,
        )
        _audit_metric(
            visual.visual_id,
            f"contributors[{index}].count",
            contributor.count,
            known_metrics,
            issues,
        )


def _audit_source_map_visual(
    visual: SourceMapVisual,
    known_sources: set[str],
    issues: list[VisualIssue],
) -> None:
    _audit_collection(visual.visual_id, "nodes", visual.nodes, issues)
    node_ids = {node.source_id for node in visual.nodes}
    for index, node in enumerate(visual.nodes):
        _audit_sources(
            visual.visual_id,
            f"nodes[{index}].source_id",
            [node.source_id],
            known_sources,
            issues,
        )
    for index, link in enumerate(visual.links):
        _audit_sources(
            visual.visual_id,
            f"links[{index}].source_id",
            [link.source_id],
            known_sources,
            issues,
        )
        _audit_sources(
            visual.visual_id,
            f"links[{index}].target_source_id",
            [link.target_source_id],
            known_sources,
            issues,
        )
        if link.source_id not in node_ids or link.target_source_id not in node_ids:
            _add_issue(
                issues,
                visual.visual_id,
                "link_node_missing",
                f"links[{index}] references a source not present in nodes",
            )


def compose_visual_markdown(manifest: ArtifactManifest) -> str:
    lines: list[str] = []
    for artifact in manifest.artifacts:
        if artifact.audit_status != "passed" or artifact.path is None:
            lines.append(
                f"- Omitted `{artifact.visual_id}`: "
                "visual audit failed or data was insufficient."
            )
            continue
        lines.extend(
            [
                f"### {artifact.title}",
                "",
                f"![{artifact.title}]({artifact.path})",
                "",
                artifact.caption,
                "",
            ]
        )
    return "\n".join(lines).strip() + "\n"


def _audit_collection(
    visual_id: str,
    field_name: str,
    values: Sequence[object],
    issues: list[VisualIssue],
) -> None:
    if not values:
        _add_issue(issues, visual_id, "empty_visual_data", f"{field_name} must not be empty")


def _audit_nonempty(
    visual_id: str,
    field_name: str,
    value: str,
    issues: list[VisualIssue],
) -> None:
    if not value.strip():
        _add_issue(issues, visual_id, "empty_text", f"{field_name} must not be empty")


def _audit_sources(
    visual_id: str,
    field_name: str,
    source_ids: list[str],
    known_sources: set[str],
    issues: list[VisualIssue],
) -> None:
    unknown = sorted(set(source_ids) - known_sources)
    if unknown:
        _add_issue(
            issues,
            visual_id,
            "unknown_source",
            f"{field_name} references unknown source IDs: {', '.join(unknown)}",
        )


def _audit_metric(
    visual_id: str,
    field_name: str,
    metric: MetricBackedNumber | None,
    known_metrics: dict[str, int | float],
    issues: list[VisualIssue],
) -> None:
    if metric is None:
        return
    if metric.value < 0:
        _add_issue(issues, visual_id, "negative_metric", f"{field_name} must not be negative")
        return
    expected = known_metrics.get(metric.metric_id)
    if expected is None:
        _add_issue(
            issues,
            visual_id,
            "unknown_metric",
            f"{field_name} references unknown metric_id {metric.metric_id}",
        )
        return
    if float(expected) != float(metric.value):
        _add_issue(
            issues,
            visual_id,
            "metric_mismatch",
            f"{field_name} value {metric.value} does not match ledger value {expected}",
        )


def _add_issue(
    issues: list[VisualIssue],
    visual_id: str,
    code: str,
    message: str,
) -> None:
    issues.append(VisualIssue(visual_id=visual_id, code=code, message=message))
