---
name: analisis-statistik
description: "Playbook olah data kuantitatif skripsi Indonesia (SPSS-parity) via tool sandbox: kapan uji apa, urutan pipeline ritual, dan cara menarasikan hasil untuk Bab 4. Use saat user mengunggah dataset atau meminta uji statistik (validitas, reliabilitas, normalitas, asumsi klasik, regresi, korelasi)."
---

## Aturan inti (jangan dilanggar)
- **Angka hanya dari tool.** Setiap angka, tabel, dan verdict lolos/tidak-lolos WAJIB berasal dari JSON hasil `run_analysis` (`tables` + `decisions`). JANGAN menghitung statistik sendiri atau menulis angka yang tak ada di hasil — untuk skripsi yang diuji dosen, angka yang tak match SPSS itu fatal.
- **Template-first.** Pilih uji HANYA dari `list_analyses`. Jangan mengarang nama uji. `run_analysis` memakai kredit — jalankan yang relevan saja, satu per satu.
- **Penanda hasil.** Setiap `run_analysis` sukses mengembalikan `marker` (`{{stats:...}}`). Tulis penanda itu PERSIS pada baris tersendiri di tempat tabel + figur harus muncul. Jangan menyalin isi tabel/gambar sebagai teks, dan jangan mengarang penanda.

## Pipeline ritual (kuesioner Likert — ±80% skripsi manajemen/ekonomi/psikologi/pendidikan)
Jalankan sesuai kebutuhan, urutannya:
1. **Profil** (`profile_dataset`, gratis) — pahami kolom, tipe, deteksi Likert, missing. Ringkas skema ke user; klarifikasi mapping variabel (kolom mana milik X1/X2/Y) via `ask_questions` bila ambigu.
2. **Deskriptif** (`descriptive`) — profil responden + Mean/SD variabel bila diminta.
3. **Validitas** (`uji_validitas`) — per variabel: korelasi Pearson tiap item terhadap skor total vs r tabel (df=n−2). Item valid bila r hitung ≥ r tabel. Ulangi untuk tiap variabel laten.
4. **Reliabilitas** (`uji_reliabilitas`) — Cronbach's alpha per variabel. Reliabel bila alpha > 0,60 (sebagian dosen 0,70).
5. **Uji asumsi klasik** (prasyarat regresi):
   - **Normalitas** (`uji_normalitas`, `mode="residual"`) — K-S Lilliefors + Shapiro pada residual regresi. Sig > 0,05 → residual normal.
   - **Multikolinearitas** (`uji_multikolinearitas`) — Tolerance > 0,10 dan VIF < 10.
   - **Heteroskedastisitas** (`uji_heteroskedastisitas`) — Glejser: Sig > 0,05 → bebas heteroskedastisitas; sertakan scatterplot.
   - **Autokorelasi** (`uji_autokorelasi`, hanya data time series/berurut) — Durbin-Watson vs tabel du/dL.
   - **Linearitas** (`uji_linearitas`) — deviation from linearity > 0,05 → hubungan linear.
6. **Regresi** (`regresi_linear`) — sederhana (1 X) atau berganda (≥2 X): Model Summary (R²), ANOVA (uji F simultan), Coefficients (uji t parsial) + persamaan regresi.
7. **Korelasi** (`korelasi`) — Pearson (interval/rasio) atau Spearman (ordinal), bila hipotesisnya hubungan (bukan pengaruh).

## Memilih uji
- Skala data → uji: interval/rasio + hubungan → Pearson/regresi; ordinal → Spearman; hipotesis pengaruh antar-variabel → regresi.
- Uji asumsi klasik hanya perlu bila hipotesis diuji dengan regresi/korelasi Pearson.
- Bila asumsi gagal (mis. residual tidak normal), sampaikan konsekuensinya dan opsi lanjutan (transformasi data / uji non-parametrik) — jangan diam-diam melanjutkan seolah lolos.

## Uji beda & lanjutan (Tier 2)
- **Beda 2 grup:** `uji_beda_t` mode `independent` (normal) / `uji_mann_whitney` (tidak normal atau ordinal). **Pre-post 1 grup:** `uji_beda_t` mode `paired` / `uji_wilcoxon`.
- **Beda ≥3 grup:** `uji_anova` (+ Tukey otomatis bila signifikan) / `uji_kruskal_wallis` (non-parametrik).
- **Dua faktor sekaligus + interaksi:** `uji_anova_dua_arah`. **Dengan kovariat yang dikontrol:** `uji_ancova`. **≥2 variabel terikat simultan:** `uji_manova`.
- **Asosiasi kategorik×kategorik:** `uji_chi_square`. **Terikat biner (0/1):** `regresi_logistik`.
- **Moderasi:** `uji_moderasi` (MRA). **Mediasi:** `uji_mediasi` (Sobel + bootstrap CI). **Likert ordinal → interval sebelum regresi:** `transformasi_msi`.

## SEM & analisis faktor (Tier 3)
- **Skripsi berbasis SmartPLS** (outer/inner model, hipotesis via T Statistics): `sem_pls` — beri `latents` (peta laten → item) + `paths` ("X1 -> Y"). Urutkan pelaporan: outer loadings → reliability & validity (alpha/CR/AVE) → discriminant validity (Fornell-Larcker + HTMT) → R Square → path coefficients (bootstrap). 20 kredit, bootstrap default 1000 sampel (butuh ~1–2 menit — beri tahu user).
- **Skripsi berbasis AMOS/LISREL** (goodness of fit chi-square/CFI/RMSEA): `cb_sem` — args sama (latents + paths). Laten 1 item otomatis jadi variabel observed.
- **Analisis faktor / uji konstruk instrumen:** `analisis_faktor` (KMO & Bartlett + PCA varimax, default SPSS). Jalankan SEBELUM membentuk skor total bila user ingin membuktikan unidimensionalitas item.
- PLS dan CB-SEM itu paradigma berbeda — jangan ditukar: tanya metode yang dipakai di proposal user bila belum jelas (SmartPLS → `sem_pls`; AMOS/LISREL/lavaan → `cb_sem`).

## Narasi Bab 4
- Setiap uji: (1) sebut nilai kunci dari `tables` (mis. "nilai Cronbach's Alpha sebesar 0,842"), (2) bandingkan dengan cutoff, (3) simpulkan pakai kalimat verdict dari `decisions` (`interpretation` sudah bergaya Bab 4 — boleh dikutip/diparafrase, jangan diubah angkanya).
- Sisipkan penanda `{{stats:...}}` tepat sebelum/sesudah paragraf interpretasi uji terkait. Tabel gaya SPSS, kartu kesimpulan, dan grafik akan muncul otomatis di sana.
- Untuk regresi: tuliskan persamaan regresi dari `decisions` (id `persamaan_regresi`), lalu jelaskan makna tiap koefisien + hasil uji t/uji F.
- Nada: objektif, bahasa Indonesia baku akademik. Jangan menyimpulkan melebihi yang didukung angka.
