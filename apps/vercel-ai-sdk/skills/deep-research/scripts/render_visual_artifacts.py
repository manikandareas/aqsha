#!/usr/bin/env python3
"""Render trusted SVG visual artifacts from a declarative visual spec."""

from __future__ import annotations

import argparse
import json
import math
import re
import sys
from collections.abc import Iterable
from pathlib import Path
from textwrap import wrap

import matplotlib

matplotlib.use("Agg")

import matplotlib.pyplot as plt  # noqa: E402
from matplotlib.axes import Axes  # noqa: E402
from matplotlib.figure import Figure  # noqa: E402
from matplotlib.patches import Circle, FancyArrowPatch, FancyBboxPatch, Rectangle  # noqa: E402


def _ensure_src_on_path() -> None:
    app_root = Path(__file__).resolve().parents[3]
    src = app_root / "src"
    if src.as_posix() not in sys.path:
        sys.path.insert(0, src.as_posix())


_ensure_src_on_path()

from astra.artifacts import (  # noqa: E402
    ArtifactManifest,
    ArtifactRecord,
    ClaimsEvidenceVisual,
    ContributorChartVisual,
    EvidenceLedger,
    ResearchGapMatrixVisual,
    SearchFlowVisual,
    SourceMapVisual,
    TimelineVisual,
    VisualIssue,
    VisualSpec,
    audit_visual_spec,
    compose_visual_markdown,
)

SLATE_900 = "#0f172a"
SLATE_700 = "#334155"
SLATE_500 = "#64748b"
SLATE_300 = "#cbd5e1"
SLATE_200 = "#e2e8f0"
SKY_400 = "#38bdf8"
TEAL_400 = "#2dd4bf"

STRENGTH_BAR_COUNTS = {
    "high": 8,
    "medium": 5,
    "low": 3,
    "insufficient": 1,
}
STRENGTH_COLORS = {
    "high": TEAL_400,
    "medium": "#facc15",
    "low": "#fb923c",
    "insufficient": SLATE_300,
}

plt.rcParams.update(
    {
        "svg.fonttype": "none",
        "font.family": ["DejaVu Sans", "Arial", "sans-serif"],
        "axes.edgecolor": SLATE_300,
        "axes.labelcolor": SLATE_700,
        "xtick.color": SLATE_500,
        "ytick.color": SLATE_500,
    }
)


def load_json(path: Path) -> object:
    return json.loads(path.read_text(encoding="utf-8"))


def render_artifacts(
    evidence_path: Path,
    visuals_path: Path,
    output_dir: Path,
    manifest_path: Path | None = None,
    markdown_path: Path | None = None,
) -> ArtifactManifest:
    evidence = EvidenceLedger.from_raw(load_json(evidence_path))
    spec = VisualSpec.model_validate(load_json(visuals_path))
    audit = audit_visual_spec(evidence, spec)
    issue_messages = _issues_by_visual(audit.issues)

    artifacts_dir = output_dir / "artifacts"
    artifacts_dir.mkdir(parents=True, exist_ok=True)

    records: list[ArtifactRecord] = []
    for visual in spec.visuals:
        if visual.visual_id in audit.failed_visual_ids:
            records.append(
                ArtifactRecord(
                    visual_id=visual.visual_id,
                    kind=visual.kind,
                    title=visual.title,
                    caption=visual.caption,
                    source_ids=visual.source_ids,
                    audit_status="failed",
                    issues=issue_messages.get(visual.visual_id, []),
                )
            )
            continue

        file_name = f"{_slugify(visual.visual_id)}.svg"
        artifact_path = artifacts_dir / file_name
        _render_visual_to_svg(visual, artifact_path)
        records.append(
            ArtifactRecord(
                visual_id=visual.visual_id,
                kind=visual.kind,
                title=visual.title,
                caption=visual.caption,
                path=f"artifacts/{file_name}",
                source_ids=visual.source_ids,
                audit_status="passed",
            )
        )

    manifest = ArtifactManifest(artifacts=records)
    target_manifest = manifest_path or output_dir / "artifact_manifest.json"
    target_manifest.write_text(manifest.model_dump_json(indent=2), encoding="utf-8")

    target_markdown = markdown_path or output_dir / "visual_artifacts.md"
    target_markdown.write_text(compose_visual_markdown(manifest), encoding="utf-8")
    return manifest


def _issues_by_visual(issues: Iterable[VisualIssue]) -> dict[str, list[str]]:
    result: dict[str, list[str]] = {}
    for issue in issues:
        result.setdefault(issue.visual_id, []).append(issue.message)
    return result


def _render_visual_to_svg(visual: object, output_path: Path) -> None:
    figure: Figure
    if isinstance(visual, TimelineVisual):
        figure = _render_timeline(visual)
    elif isinstance(visual, SearchFlowVisual):
        figure = _render_search_flow(visual)
    elif isinstance(visual, ClaimsEvidenceVisual):
        figure = _render_claims_evidence(visual)
    elif isinstance(visual, ResearchGapMatrixVisual):
        figure = _render_gap_matrix(visual)
    elif isinstance(visual, ContributorChartVisual):
        figure = _render_contributors(visual)
    elif isinstance(visual, SourceMapVisual):
        figure = _render_source_map(visual)
    else:
        raise TypeError(f"Unsupported visual type: {type(visual).__name__}")

    try:
        figure.savefig(
            output_path,
            format="svg",
            bbox_inches="tight",
            facecolor="white",
            metadata={"Date": None},
        )
    finally:
        plt.close(figure)


def _render_timeline(visual: TimelineVisual) -> Figure:
    figure, axis = _new_figure(width=9, height=3.4)
    _title(axis, visual.title)

    years = [item.year for item in visual.items]
    min_year = min(years)
    max_year = max(years)
    y_values = [1 + (index % 4) * 0.18 for index, _ in enumerate(visual.items)]
    sizes = [
        160
        if item.citation_count is None
        else min(640, 140 + float(item.citation_count.value) * 28)
        for item in visual.items
    ]

    axis.axhline(0.8, color=SLATE_300, linewidth=1.2)
    axis.scatter(years, y_values, s=sizes, color=SKY_400, edgecolor=SLATE_900, linewidth=0.4)
    for year, y_value, item in zip(years, y_values, visual.items, strict=True):
        axis.vlines(year, 0.8, y_value, color=SLATE_200, linewidth=1)
        axis.text(year, y_value, item.label, ha="center", va="center", fontsize=9, color=SLATE_900)

    axis.set_xlim(min_year - 0.6, max_year + 0.6)
    axis.set_ylim(0.55, 1.85)
    axis.set_xticks(range(min_year, max_year + 1))
    axis.set_yticks([])
    _hide_spines(axis)
    _caption(axis, visual.caption)
    return figure


def _render_search_flow(visual: SearchFlowVisual) -> Figure:
    count = len(visual.stages)
    figure, axis = _new_figure(width=max(7, count * 2.2), height=2.8)
    _title(axis, visual.title)
    axis.set_xlim(0, count)
    axis.set_ylim(0, 1)

    for index, stage in enumerate(visual.stages):
        x = index + 0.08
        box = FancyBboxPatch(
            (x, 0.38),
            0.78,
            0.28,
            boxstyle="round,pad=0.035,rounding_size=0.04",
            linewidth=1,
            edgecolor=SLATE_200,
            facecolor="#f1f5f9",
        )
        axis.add_patch(box)
        axis.text(x + 0.08, 0.56, _number(float(stage.count.value)), fontsize=16, weight="bold")
        axis.text(x + 0.08, 0.44, stage.label, fontsize=9, color=SLATE_500)
        if index < count - 1:
            axis.add_patch(
                FancyArrowPatch(
                    (index + 0.88, 0.52),
                    (index + 1.03, 0.52),
                    arrowstyle="->",
                    mutation_scale=12,
                    color=SLATE_500,
                )
            )

    _hide_axes(axis)
    _caption(axis, visual.caption)
    return figure


def _render_claims_evidence(visual: ClaimsEvidenceVisual) -> Figure:
    row_height = 0.72
    figure, axis = _new_figure(width=11, height=max(3, 1.7 + len(visual.rows) * row_height))
    _title(axis, visual.title)
    axis.set_xlim(0, 1)
    axis.set_ylim(0, 1)

    headers = [("Claim", 0.03), ("Strength", 0.38), ("Reasoning", 0.54), ("Sources", 0.79)]
    for label, x in headers:
        axis.text(x, 0.83, label, fontsize=10, weight="bold", transform=axis.transAxes)

    start_y = 0.74
    step = 0.66 / max(len(visual.rows), 1)
    for index, row in enumerate(visual.rows):
        y = start_y - index * step
        axis.axhline(y + 0.055, xmin=0.03, xmax=0.97, color=SLATE_200, linewidth=1)
        axis.text(0.03, y, _wrap(row.claim, 42), fontsize=9, va="top", transform=axis.transAxes)
        _draw_strength_bar(axis, 0.38, y - 0.07, row.evidence_strength)
        axis.text(0.54, y, _wrap(row.reasoning, 34), fontsize=9, va="top", transform=axis.transAxes)
        axis.text(
            0.79,
            y,
            _wrap(", ".join(row.supporting_sources), 22),
            fontsize=9,
            va="top",
            transform=axis.transAxes,
        )

    _hide_axes(axis)
    return figure


def _render_gap_matrix(visual: ResearchGapMatrixVisual) -> Figure:
    values = [[0.0 for _ in visual.columns] for _ in visual.rows]
    for cell in visual.cells:
        row_index = visual.rows.index(cell.row_label)
        column_index = visual.columns.index(cell.column_label)
        values[row_index][column_index] = float(cell.value.value)

    figure, axis = _new_figure(
        width=max(5.5, 1.45 * len(visual.columns) + 2.2),
        height=max(3.2, 0.72 * len(visual.rows) + 1.8),
    )
    axis.set_title(visual.title, loc="left", fontsize=13, weight="bold", pad=18)
    image = axis.imshow(values, cmap="Blues", aspect="auto", vmin=0)
    axis.set_xticks(range(len(visual.columns)), labels=visual.columns)
    axis.set_yticks(range(len(visual.rows)), labels=visual.rows)
    axis.tick_params(axis="x", labelrotation=0, labelsize=9)
    axis.tick_params(axis="y", labelsize=9)
    for row_index, row in enumerate(values):
        for column_index, value in enumerate(row):
            axis.text(
                column_index,
                row_index,
                _number(value),
                ha="center",
                va="center",
                fontsize=10,
            )
    figure.colorbar(image, ax=axis, fraction=0.035, pad=0.04)
    _caption(axis, visual.caption, y=-0.26)
    return figure


def _render_contributors(visual: ContributorChartVisual) -> Figure:
    contributors = sorted(
        visual.contributors,
        key=lambda contributor: float(contributor.count.value),
    )
    labels = [item.label for item in contributors]
    values = [float(item.count.value) for item in contributors]
    figure, axis = _new_figure(width=9, height=max(3, 0.45 * len(labels) + 1.4))
    axis.set_title(visual.title, loc="left", fontsize=13, weight="bold", pad=18)
    axis.barh(labels, values, color=SKY_400, edgecolor=SLATE_900, linewidth=0.3)
    for index, value in enumerate(values):
        axis.text(value, index, f" {_number(value)}", va="center", fontsize=9)
    axis.grid(axis="x", color=SLATE_200, linewidth=0.8)
    _hide_spines(axis)
    _caption(axis, visual.caption, y=-0.22)
    return figure


def _render_source_map(visual: SourceMapVisual) -> Figure:
    figure, axis = _new_figure(width=9, height=4.2)
    _title(axis, visual.title)
    axis.set_xlim(0, 1)
    axis.set_ylim(0, 1)

    positions: dict[str, tuple[float, float]] = {}
    columns = min(4, max(1, len(visual.nodes)))
    rows = math.ceil(len(visual.nodes) / columns)
    for index, node in enumerate(visual.nodes):
        col = index % columns
        row = index // columns
        x = 0.12 + col * (0.76 / max(columns - 1, 1))
        y = 0.68 - row * (0.42 / max(rows - 1, 1))
        positions[node.source_id] = (x, y)

    for link in visual.links:
        start = positions.get(link.source_id)
        end = positions.get(link.target_source_id)
        if start and end:
            axis.add_patch(
                FancyArrowPatch(
                    start,
                    end,
                arrowstyle="-",
                linewidth=1,
                    color="#94a3b8",
                    transform=axis.transAxes,
                )
            )

    for node in visual.nodes:
        x, y = positions[node.source_id]
        axis.add_patch(
            Circle(
                (x, y),
                0.045,
                transform=axis.transAxes,
                facecolor=TEAL_400,
                edgecolor=SLATE_900,
                linewidth=0.4,
            )
        )
        axis.text(x, y, node.source_id, ha="center", va="center", fontsize=9, weight="bold")
        axis.text(x, y - 0.075, _wrap(node.label, 18), ha="center", va="top", fontsize=8)

    _hide_axes(axis)
    _caption(axis, visual.caption)
    return figure


def _draw_strength_bar(axis: Axes, x: float, y: float, strength: str) -> None:
    active = STRENGTH_BAR_COUNTS[strength]
    color = STRENGTH_COLORS[strength]
    for index in range(10):
        fill = color if index < active else "#e5e7eb"
        axis.add_patch(
            Rectangle(
                (x + index * 0.011, y),
                0.007,
                0.07,
                transform=axis.transAxes,
                facecolor=fill,
                edgecolor=fill,
            )
        )
    axis.text(x, y - 0.035, strength.title(), fontsize=8, color=SLATE_500, transform=axis.transAxes)


def _new_figure(width: float, height: float) -> tuple[Figure, Axes]:
    figure, axis = plt.subplots(figsize=(width, height), dpi=120)
    figure.patch.set_facecolor("white")
    return figure, axis


def _title(axis: Axes, text: str) -> None:
    axis.text(0.0, 0.95, text, fontsize=13, weight="bold", transform=axis.transAxes)


def _caption(axis: Axes, text: str, y: float = 0.03) -> None:
    axis.text(0.0, y, _wrap(text, 120), fontsize=8, color=SLATE_500, transform=axis.transAxes)


def _hide_axes(axis: Axes) -> None:
    axis.set_xticks([])
    axis.set_yticks([])
    _hide_spines(axis)


def _hide_spines(axis: Axes) -> None:
    for spine in axis.spines.values():
        spine.set_visible(False)


def _wrap(text: str, width: int) -> str:
    return "\n".join(wrap(text, width=width, break_long_words=False))


def _number(value: float) -> str:
    return str(int(value)) if value.is_integer() else f"{value:.2f}"


def _slugify(value: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9._-]+", "-", value.strip()).strip(".-").lower()
    return slug[:80] or "visual"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--evidence", required=True, type=Path, help="Evidence ledger JSON.")
    parser.add_argument("--visuals", required=True, type=Path, help="Visual spec JSON.")
    parser.add_argument("--out-dir", required=True, type=Path, help="Artifact output directory.")
    parser.add_argument("--manifest", type=Path, help="Manifest output path.")
    parser.add_argument("--markdown", type=Path, help="Markdown snippet output path.")
    args = parser.parse_args()

    manifest = render_artifacts(
        evidence_path=args.evidence,
        visuals_path=args.visuals,
        output_dir=args.out_dir,
        manifest_path=args.manifest,
        markdown_path=args.markdown,
    )
    print(manifest.model_dump_json(indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
