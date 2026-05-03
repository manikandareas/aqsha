---
name: deep-research
description: Use this skill when a user asks for rigorous, source-grounded, multi-step research on complex topics, including academic literature reviews, technical research, market or industry research, policy or regulatory analysis, competitive analysis, evidence synthesis, or research report generation. The skill guides agents through scoping, search planning, source discovery, screening, extraction, synthesis, hypothesis or insight generation, verification, human checkpoints, and final reporting with citations and uncertainty.
metadata:
  short-description: Rigorous source-grounded research workflow
  version: "1.0.0"
  category: research
---

# Deep Research Skill

## Purpose

Help Astra conduct rigorous, source-grounded research without fabricating sources,
overstating evidence, or hiding uncertainty. This skill assists human researchers;
it does not replace expert judgment.

## Use This Skill When

Use this skill for:

- Academic research or literature reviews
- Technical research and architecture investigations
- Market, industry, or competitive analysis
- Policy, regulatory, legal, or standards research
- Evidence synthesis across many sources
- Research briefs, reports, memos, or decision documents
- Complex questions where answer quality depends on source quality

Do not use this skill for simple factual lookups, purely creative writing, or tasks
where the user explicitly asks not to research.

## Core Operating Principles

1. Separate evidence from inference.
2. Prefer primary, authoritative, recent, and method-transparent sources.
3. Keep a search log: queries, databases, dates, filters, and exclusions.
4. Screen sources before synthesizing.
5. Extract structured evidence before writing conclusions.
6. Every important factual claim must be traceable to one or more sources.
7. Never invent citations, papers, links, datasets, laws, quotes, or numeric results.
8. Report uncertainty, conflicting evidence, and evidence gaps explicitly.
9. Use human checkpoints for scope, source selection, major interpretations, and final claims.
10. Stop or pivot when the evidence cannot support the requested conclusion.

## Research Depths

Choose the smallest depth that satisfies the user:

- Quick scan: 3 to 8 high-quality sources, short answer, clear caveats.
- Standard brief: 8 to 20 sources, structured synthesis, evidence table.
- Deep report: 20+ sources, formal method, screening log, extraction matrix, verification pass.
- Living review: repeatable search protocol, update log, versioned conclusions.

## End-to-End Workflow

1. Scope the research question.
2. Build a search strategy.
3. Discover sources.
4. Screen and deduplicate.
5. Extract knowledge.
6. Synthesize.
7. Generate hypotheses or insights.
8. Generate visual artifact specs when the evidence ledger has enough structured data.
9. Run the research decision loop: PROCEED, REFINE, or PIVOT.
10. Verify sources, citations, claims, quotes, numbers, dates, and visual provenance.
11. Produce the final Markdown output with audited artifact embeds when available.

Load the referenced files only as needed:

- `references/research-workflow.md` for the full procedure and artifacts.
- `references/evidence-quality-rubric.md` for source appraisal.
- `references/extraction-schema.md` for evidence cards and claim records.
- `references/synthesis-and-decision-loop.md` for synthesis and PROCEED/REFINE/PIVOT.
- `references/report-templates.md` for output formats.
- `references/visual-artifacts.md` for graph, timeline, matrix, and artifact rules.
- `references/verification-checklist.md` before final delivery.

For any code execution, data analysis, Python/R/Node scripts, dependency
installation, plotting, or file generation, use the server-provided Daytona sandbox
through `runSkillScript`. Do not assume the API host has Python, pip, system
packages, project-local Python modules, or plotting libraries installed. Treat
local execution as unavailable unless explicitly enabled by the server.

If working with a Markdown report and JSON evidence ledger, run
`scripts/audit_evidence.py` through sandbox-backed `runSkillScript` before final
delivery.

For research reports with `evidence.json` and `visuals.json`, run
`scripts/audit_visuals.py` and `scripts/render_visual_artifacts.py` through the
Daytona sandbox before final delivery. Embed only artifacts whose persisted
manifest status is `passed`. If sandbox execution, rendering, or audit fails,
omit visuals and explain that rendering was skipped.

## Citation Requirements

- Use stable source IDs such as `[S1]`, `[S2]`, and `[S3]`.
- Every important factual claim should cite at least one source ID.
- Direct quotes must be short, exact, and cited.
- Numeric claims require the exact source and context.
- Bibliography entries must include title, author or organization, date, URL or DOI
  when available, and access date for web sources.
- If a citation cannot be verified, remove the claim or mark it as unverified.

## Human-in-the-Loop Checkpoints

Pause for user confirmation when practical at these points:

- Research scope and success criteria
- Search strategy for deep reports
- Final included source set for high-stakes work
- Interpretation of contradictory evidence
- Any PIVOT decision
- Final report before publication, submission, or operational use

For low-risk quick scans, proceed without pausing but state assumptions.

## Failure and Uncertainty Handling

If evidence is weak, missing, contradictory, inaccessible, outdated, or biased:

- Say so directly.
- Explain what was searched and what was not found.
- Lower confidence rather than forcing a conclusion.
- Recommend additional sources, expert review, data access, or a narrower question.
- Use REFINE if another search pass is likely to help.
- Use PIVOT if the original question cannot be responsibly answered.

## Execution Checklist

- [ ] Scope question, audience, depth, and constraints.
- [ ] Create search strategy and source plan.
- [ ] Discover sources across relevant source classes.
- [ ] Screen and deduplicate sources.
- [ ] Build evidence cards.
- [ ] Synthesize themes, conflicts, gaps, and confidence.
- [ ] Generate insights or hypotheses with counterevidence.
- [ ] Generate visual specs from verified evidence when data is sufficient.
- [ ] Decide PROCEED, REFINE, or PIVOT.
- [ ] Verify citations, claims, quotes, numbers, dates, and visual provenance.
- [ ] Produce final Markdown report with uncertainty, bibliography, and audited artifact embeds.
