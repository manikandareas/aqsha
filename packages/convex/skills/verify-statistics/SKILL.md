---
name: verify-statistics
description: "Statistical verification recipe — when statcheck/GRIM/power apply, rounding-tolerance thresholds, and honest interpretation. Use when checking the consistency of a paper's reported statistics (p-value, mean/SD, power)."
license: Proprietary
metadata:
  author: aqsha
  version: "1.0"
  scope: builtin
  triggerKeywords: [verifikasi, statistik, statcheck, grim, grimmer, power, p-value, mean, konsistensi, angka, pembulatan, toleransi]
---
## When it applies
statcheck covers NHST-style APA reporting only (t, F, r, chi-square, z). GRIM/GRIMMER cover mean/SD on integer scales with small N. Power analysis is prospective (effect size + N), not post-hoc.

## Interpretation
A numeric discrepancy is NOT a fraud accusation. Common causes: rounding, typos, unreported corrections, one-tailed tests, or text-extraction artifacts. Only a significance-decision change (crossing the threshold) is escalated to "needs review".

## Reporting
Always attach the recomputed result so it can be re-checked, state the coverage limits, and use neutral language.
