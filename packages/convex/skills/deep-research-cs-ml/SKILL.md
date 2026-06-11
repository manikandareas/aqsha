---
name: deep-research-cs-ml
description: "Metodologi deep research bidang computer science/machine learning: disiplin benchmark dan SOTA, ablation dan reproducibility, pembobotan preprint, serta kewaspadaan terhadap leaderboard. Gunakan untuk pertanyaan riset CS/ML lintas sumber."
license: Proprietary
metadata: { author: aqsha, version: "1.0", scope: builtin }
---
## Benchmark dan SOTA
Klaim "state-of-the-art" harus disertai benchmark, split data, dan metrik yang sama persis dengan pembanding. Waspadai cherry-picking metrik dan perbandingan tidak apple-to-apple (beda ukuran model, data pretraining, atau anggaran komputasi).

## Reproducibility dan ablation
Utamakan makalah dengan kode + checkpoint terbuka dan studi ablation yang mengisolasi kontribusi tiap komponen. Tanpa ablation, atribusi peningkatan ke ide inti lemah. Catat seed, varians antar-run, dan apakah hasil rata-rata atau best-of-N.

## Pembobotan preprint
arXiv/preprint diberi bobot lebih rendah dan ditandai eksplisit sampai ada peer-review (NeurIPS/ICML/ICLR/ACL/CVPR dst.). Bedakan klaim yang sudah direplikasi komunitas dari klaim baru yang belum diuji ulang.

## Kewaspadaan leaderboard
Leaderboard publik rawan overfitting ke test set dan kontaminasi data (test set bocor ke pretraining). Periksa tanggal rilis benchmark vs. tanggal pelatihan model. Nyatakan batas generalisasi di luar distribusi benchmark.
