---
name: research-cs-ml
description: "Deep-research methodology for computer science / machine learning — benchmark and SOTA discipline, ablation and reproducibility, preprint weighting, and leaderboard caution. Use for cross-source CS/ML research questions."
license: Proprietary
metadata:
  author: aqsha
  version: "1.0"
  scope: builtin
  triggerKeywords: [benchmark, sota, ablation, reproducibility, preprint, leaderboard, machine, learning, computer, science, model, komputasi]
---
## Benchmark & SOTA
A "state-of-the-art" claim must come with the benchmark, data split, and metric that match the comparison exactly. Watch for cherry-picked metrics and non-apple-to-apple comparisons (different model size, pretraining data, or compute budget).

## Reproducibility & ablation
Prefer papers with open code + checkpoints and ablation studies that isolate each component's contribution. Without ablation, attributing the gain to the core idea is weak. Record seeds, run-to-run variance, and whether results are averaged or best-of-N.

## Preprint weighting
Weight arXiv/preprints lower and flag them explicitly until peer review (NeurIPS/ICML/ICLR/ACL/CVPR, etc.). Distinguish community-replicated claims from new, untested ones.

## Leaderboard caution
Public leaderboards are prone to test-set overfitting and data contamination (test set leaking into pretraining). Check the benchmark's release date against the model's training date. State the limits of generalization beyond the benchmark distribution.
