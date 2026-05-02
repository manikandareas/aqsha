# Knowledge Extraction Schema

Create one evidence card per included source.

## Evidence Card

```yaml
source_id: S1
title:
authors_or_organization:
year:
date_published:
date_accessed:
source_type:
journal_or_publisher:
tier: A | B | C | D
quality_score: 0
url:
doi:
jurisdiction:
domain:
topics:
  -
research_question_relevance:
method:
data_or_sample:
population_or_market:
intervention_or_subject:
comparison:
outcomes_or_metrics:
  - metric:
    value:
    unit:
    context:
    source_location:
key_findings:
  - claim:
    evidence:
    page_or_section:
    quote:
limitations:
  -
bias_or_conflict_of_interest:
important_numbers:
  - metric_id:
    metric:
    value:
    unit:
    context:
    source_location:
visual_metrics:
  - metric_id:
    value:
    unit:
    context:
    source_ids:
      - S1
contradictions_or_tensions:
related_sources:
extraction_notes:
verification_status: verified | partially_verified | unverified
```

## Claim Record

Use claim records for important report claims.

```yaml
claim_id: C1
claim_text:
claim_type: factual | numeric | causal | comparative | legal | forecast | recommendation
supporting_sources:
  - S1
  - S2
counterevidence:
  - S3
evidence_strength: high | medium | low | insufficient
confidence: high | medium | low | insufficient
assumptions:
uncertainties:
verification_status: verified | partially_verified | unverified
final_wording:
```

## Visual Spec Record

Use visual specs only after evidence cards and claim records exist. Specs are
declarative data for trusted render scripts, not generated plotting code.

```yaml
visuals:
  - visual_id: evidence-timeline
    kind: timeline
    title: Evidence Timeline
    caption: Publication timeline for included sources.
    source_ids: [S1, S2]
    items:
      - label: S1
        year: 2024
        source_ids: [S1]
        citation_count:
          metric_id: citations-s1
          value: 12
```

## Extraction Rules

- Extract before synthesizing.
- Keep direct quotes short and exact.
- Do not copy long passages.
- Normalize dates and units.
- Preserve source context for numeric claims.
- Mark missing method, sample, or conflict-of-interest information.
- Do not convert correlation into causation.
- Do not treat abstracts as full evidence when the full text is needed.
- Keep source claims separate from agent interpretation.
- Store visual-ready numeric values in `visual_metrics` and reference them by `metric_id`.
- Do not create visual specs for missing dates, missing source IDs, or guessed counts.
