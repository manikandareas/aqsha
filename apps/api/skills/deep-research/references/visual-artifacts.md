# Visual Artifacts

Deep research outputs should include visual artifacts whenever the evidence
ledger contains enough structured data. The final report remains Markdown and
embeds audited PNG artifacts.

## Artifact Principle

The agent writes evidence and visual specs. Trusted Bun scripts render graphics
with Vega-Lite or Vega in the sandbox. Do not generate arbitrary plotting code
for v1.

Every visual must be traceable to `evidence.json`:

- Source references must use stable source IDs such as `S1`.
- Numeric visual values must use metric IDs from `visual_metrics`.
- Captions must describe only what the evidence supports.
- If data is insufficient, omit the visual and record why in the artifact
  manifest and Research Trail. Do not mention omitted visuals in the final
  Markdown report.

## Required Files

- `evidence.json`: sources, claims, visual metrics, and supporting metadata.
- `visuals.json`: declarative Vega-Lite or Vega visual specs.
- `artifact_manifest.json`: render output, audit status, captions, and paths.
- `visual_artifacts.md`: Markdown snippet containing only passed artifacts.

## Supported Visuals

Use these visuals when data is available:

- `search_flow`: screening counts such as retrieved, screened, included, cited.
- `timeline`: source or finding dates by year.
- `claims_evidence`: claims, evidence strength, reasoning, and source IDs.
- `research_gap_matrix`: topic or outcome by source type, population, or period.
- `contributor_chart`: authors, organizations, journals, or publishers.
- `source_map`: source relationships when `related_sources` is explicit.

## Spec Rules

- Use explicit list records, not object maps keyed by arbitrary IDs.
- Put reusable numbers in `visual_metrics`, then reference them by `metric_id`.
- Keep visual IDs stable and filename-safe, for example `evidence-timeline`.
- Keep artifact paths relative to the report directory, for example
  `artifacts/evidence-timeline.png`.
- Use the `render-vega` trusted script id to create PNG artifacts from audited
  Vega-Lite or Vega specs.

## Markdown Embed Pattern

```markdown
## Evidence Timeline

![Evidence Timeline](artifacts/evidence-timeline.png)

Timeline of included sources by publication year. Marker size reflects citation
count where citation metadata was available.
```
