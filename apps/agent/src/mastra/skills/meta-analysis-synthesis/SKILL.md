---
name: meta-analysis-synthesis
description: "Meta-analysis methodology — when and how to pool effect sizes (fixed vs random effects), assess heterogeneity (I²/Q/τ²), test for publication bias (Egger, trim-and-fill), and report results neutrally. Use when synthesizing quantitative results across multiple studies."
---
## When to pool
Pool only studies that estimate the same underlying effect on comparable populations, designs, and outcomes. If studies are too clinically/methodologically diverse, describe them narratively instead of forcing a single pooled number. State the effect measure up front (standardized mean difference, log odds/risk ratio, correlation).

## Fixed vs random effects
Default to **random-effects** (`metafor::rma`) — it assumes the true effect varies across studies, which is realistic for heterogeneous literatures. Use fixed-effect only when studies are functional replicates of one another. Report the pooled estimate with its 95% CI and the number of studies (k).

## Heterogeneity
Report Q (with its p-value), I² (share of variance from heterogeneity, not chance), and τ² (between-study variance). High I² (roughly >50–75%) means the pooled estimate summarizes a distribution, not a single value — interpret it cautiously and explore moderators if data allow.

## Publication bias
With enough studies (k ≳ 10), inspect the funnel plot and run Egger's regression test; use trim-and-fill to estimate a bias-adjusted estimate. Treat these as diagnostics, not proof — small-study effects can have non-bias causes.

## Reporting
Present a forest plot (per-study effects + pooled diamond) and the funnel plot. Use neutral language: an adjusted estimate or asymmetry is a signal to interpret carefully, not an accusation. State coverage and which studies were excluded and why.
