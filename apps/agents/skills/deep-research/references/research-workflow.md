# Deep Research Workflow

## 1. Intake and Scope

Record the research question, user goal, audience, domain, geography or
jurisdiction, time range, depth, source preferences, output format, assumptions,
and high-stakes risks.

If the question is broad, split it into subquestions before searching.

## 2. Research Plan

Create:

- Primary question
- Subquestions
- Inclusion criteria
- Exclusion criteria
- Source classes
- Search strings
- Databases or locations to search
- Screening rules
- Extraction fields
- Verification plan

## 3. Source Discovery

Use domain-appropriate sources.

Academic:

- Peer-reviewed papers
- Preprints with caution
- Systematic reviews
- Datasets
- Citation trails
- Conference proceedings

Technical:

- Official documentation
- Standards
- Source code
- Design docs
- RFCs
- Issue trackers
- Release notes
- Benchmarks

Market or competitive:

- Company filings
- Pricing pages
- Product docs
- Analyst reports
- Customer reviews
- Job postings
- Public financials

Policy or regulatory:

- Statutes
- Regulations
- Agency guidance
- Court or enforcement records
- Official consultations
- Standards bodies
- Legislative history

## 4. Search Log

For every material search, record:

- Date
- Search location
- Exact query
- Filters
- Number of results inspected
- Inclusion notes
- Exclusion notes

## 5. Screening

Assign each source:

- Include
- Exclude
- Defer

Record the reason.

Common exclusion reasons:

- Not relevant
- Duplicate
- Too old for the question
- Low authority
- No method or evidence
- Opinion only
- Unverifiable
- Conflict of interest without supporting evidence

## 6. Extraction

Create one evidence card per included source using `extraction-schema.md`.

Do not synthesize directly from raw sources. Extract first.

## 7. Synthesis

Build an evidence matrix:

- Rows: claims, themes, hypotheses, or subquestions
- Columns: source IDs
- Cells: support, contradiction, limitation, or no evidence

Look for convergent evidence, conflicting evidence, methodological differences,
context differences, time trends, gaps, outliers, and bias.

## 8. Decision Loop

After synthesis, choose:

- PROCEED: enough evidence to answer.
- REFINE: another focused search or extraction pass is needed.
- PIVOT: the original question should change.

Record the reason.

## 9. Verification

Before final output:

- Verify every cited source exists.
- Check that citations support the claims attached to them.
- Check numeric claims against source context.
- Check direct quotes exactly.
- Check dates and jurisdiction.
- Remove or qualify unsupported claims.

## 10. Final Output

The final output must include:

- Answer or findings
- Method summary
- Evidence basis
- Confidence level
- Limitations
- Uncertainty
- References
