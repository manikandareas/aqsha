# Verification Checklist

Run before final delivery.

## Source Verification

- [ ] Every cited source exists.
- [ ] Every URL or DOI works, or an archived/access note is provided.
- [ ] Bibliography metadata matches the source.
- [ ] Source dates are correct.
- [ ] Jurisdiction or context is correct.

## Citation Verification

- [ ] Every factual claim with a citation is actually supported by that citation.
- [ ] No source is cited for a claim it does not make.
- [ ] Direct quotes are exact and short.
- [ ] Page, section, or location is included when available.
- [ ] Unverified citations are removed or marked.

## Numeric Verification

- [ ] Every number has a source.
- [ ] Units are preserved.
- [ ] Time period is preserved.
- [ ] Denominator or sample is clear.
- [ ] Derived calculations are shown or explained.

## Visual Artifact Verification

- [ ] Every visual source ID exists in `evidence.json`.
- [ ] Every visual number references a `visual_metrics.metric_id`.
- [ ] Visual captions do not overstate the evidence.
- [ ] Visuals with missing dates, sources, or metrics are omitted.
- [ ] `artifact_manifest.json` marks embedded artifacts as `passed`.
- [ ] Final Markdown embeds only passed artifacts.

## Synthesis Verification

- [ ] Contradictory evidence is represented.
- [ ] Confidence matches evidence quality.
- [ ] Correlation is not framed as causation without support.
- [ ] Forecasts are labeled as forecasts.
- [ ] Recommendations are tied to evidence and assumptions.

## Responsible Use

- [ ] The output does not impersonate professional legal, medical, financial, or academic authority.
- [ ] High-stakes claims include appropriate caveats.
- [ ] Human review is recommended where needed.
- [ ] No fabricated sources, papers, laws, datasets, quotes, or results remain.
- [ ] No fabricated graph, timeline, matrix, or visual metric remains.

## Final Gate

Choose one:

- PROCEED: final output can be delivered.
- REFINE: more search, extraction, or verification is required.
- PIVOT: the research question should change.
