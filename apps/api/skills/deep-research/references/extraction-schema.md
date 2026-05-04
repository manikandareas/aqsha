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
- Keep reusable numbers in `important_numbers` with stable `metric_id` values.
