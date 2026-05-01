# Synthesis and Decision Loop

## Synthesis Method

Start from evidence cards, not memory.

For each subquestion:

1. List the strongest supporting sources.
2. List contradictory or limiting sources.
3. Compare source quality.
4. Identify method or context differences.
5. Decide what can be concluded.
6. Assign confidence.
7. Record caveats.

## Synthesis Patterns

Use these patterns:

- Convergence: multiple independent sources support the same claim.
- Divergence: credible sources disagree.
- Gap: important evidence is missing.
- Boundary: claim holds only in specific contexts.
- Mechanism: evidence explains why or how something happens.
- Trend: evidence changes over time.
- Outlier: one source differs from the rest.
- Tradeoff: benefits and costs vary by stakeholder or context.

## Hypothesis or Insight Generation

A useful hypothesis or insight must include:

- Statement
- Why it matters
- Supporting evidence
- Counterevidence
- Assumptions
- What would change confidence
- Practical test or next research step

Template:

```yaml
insight_id: I1
statement:
importance:
supporting_sources:
counterevidence:
assumptions:
confidence: high | medium | low
tests_or_next_steps:
```

## Decision Loop

After synthesis, choose one.

### PROCEED

Use when the source base is strong enough for the requested output, main claims
are supported, remaining uncertainty is documented, and no blocking verification
failures remain.

Next action: write or finalize the output.

### REFINE

Use when search coverage is thin, important source classes are missing,
screening criteria were wrong, extraction is incomplete, contradictions require
another pass, or an important claim has not been verified.

Next action: run a targeted search, extraction, or verification pass.

### PIVOT

Use when the original question is false-framed, the evidence points to a more
useful question, the topic is too broad, required evidence is unavailable, or
the requested conclusion is unsupported.

Next action: propose the new question and ask for human confirmation unless the
user already authorized autonomous pivoting.

## Decision Log

```yaml
decision: PROCEED | REFINE | PIVOT
reason:
evidence_summary:
blocking_gaps:
next_action:
human_confirmation_required: true | false
```

## Anti-Hallucination Rules

- Do not fill evidence gaps with plausible claims.
- Do not infer consensus from a small or biased source set.
- Do not cite a source for a claim it does not make.
- Do not hide contradictory evidence.
- Do not upgrade confidence because the final report sounds coherent.
