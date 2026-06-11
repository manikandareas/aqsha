---
name: stat-verification
description: "Resep verifikasi statistik: kapan statcheck/GRIM/power applicable, ambang toleransi pembulatan, dan interpretasi yang jujur. Gunakan saat memeriksa konsistensi angka statistik (p-value, mean/SD, power) sebuah paper."
license: Proprietary
metadata: { author: aqsha, version: "1.0", scope: builtin }
---
## Kapan berlaku
statcheck hanya untuk pelaporan NHST gaya APA (t, F, r, chi-square, z). GRIM/GRIMMER untuk mean/SD pada skala integer dengan N kecil. Power analysis bersifat prospektif (effect size + N), bukan post-hoc.

## Interpretasi
Diskrepansi angka BUKAN tuduhan fraud. Penyebab umum: pembulatan, salah ketik, koreksi tidak dilaporkan, uji satu-arah, atau artefak ekstraksi teks. Hanya perbedaan keputusan signifikansi (melewati ambang) yang naik ke "perlu ditinjau".

## Pelaporan
Selalu tautkan hasil recompute agar dapat diperiksa ulang, sebutkan batas cakupan, dan gunakan bahasa netral.
