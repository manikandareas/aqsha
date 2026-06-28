---
name: deep-research
description: Metodologi & standar penulisan untuk riset mendalam tercitasi. Orkestrasi /deep dijalankan oleh Workflow `deep-research` (plan-gate, literature search, bukti tandingan, verifikasi sitasi, sintesis); skill ini memandu kualitas rencana & penulisan akhir.
---

# Deep research

Metodologi untuk menjawab pertanyaan riset secara mendalam dan jujur. Berhenti saat bukti
sudah cukup, dan sampaikan ketidakpastian apa adanya.

> **Catatan runtime:** `/deep` dijalankan sebagai **Workflow `deep-research`** yang deterministik
> (bukan loop model-driven). Workflow yang mengorkestrasi langkah-langkah; skill ini memandu dua
> hal yang menjadi tanggung jawabmu sebagai penyusun rencana dan penulis akhir: **mutu rencana**
> dan **mutu sintesis tercitasi**. Kamu tidak perlu memanggil tool orkestrasi (klarifikasi,
> gerbang billing, delegasi subagent, verifikasi) — itu sudah ditangani langkah Workflow.

## Alur Workflow (konteks)

1. **Draft rencana** — kamu menyusun rencana prosa + 3-6 sub-pertanyaan (langkah ini).
2. **Plan-gate (HITL)** — Workflow men-suspend; pengguna menyetujui/menyunting/membatalkan
   rencana lewat kartu. Setelah disetujui, gerbang kuota deep research berjalan otomatis.
3. **Cari literatur** — satu pencari per sub-pertanyaan (paralel), mengumpulkan bukti bernomor `[n]`.
4. **Bukti tandingan** — pencarian adversarial atas kesimpulan yang terbentuk.
5. **Verifikasi sitasi** — integritas referensi diperiksa batch (`verify_identifiers`).
6. **Sintesis** — kamu menulis jawaban tercitasi akhir (langkah ini).

## Menyusun rencana yang baik (langkah draft)

Tulis rencana sebagai **prosa mengalir** (BUKAN daftar Q1-Q5, BUKAN form). Dalam beberapa
kalimat, jelaskan: apa yang akan diselidiki, sub-arah/aspek utama yang ditelusuri terpisah,
jenis sumber yang dicari (primer/tinjauan sistematis), dan bagaimana bukti akan diverifikasi.
Lalu turunkan **3-6 sub-pertanyaan** spesifik dari rencana itu — masing-masing cukup sempit
untuk dijawab dengan beberapa sumber, dan bersama-sama mencakup pertanyaan utama.

Pertimbangkan (pilih yang relevan, jangan memaksakan semuanya): tujuan/penggunaan hasil,
batasan rentang tahun/populasi/domain/geografi, kedalaman (survey cepat vs tinjauan
sistematis), definisi istilah ambigu, serta sudut pandang yang harus/tak boleh disertakan.
Bila topik sudah sangat spesifik, rencana yang ringkas sudah cukup — jangan melebar tanpa perlu.

## Menulis sintesis tercitasi (langkah akhir)

Sebelum menulis, pilih domain-pack yang relevan dan baca lewat tool skill untuk metodologi +
gaya penulisannya (mis. `research-medicine`/`research-cs-ml`/`research-education`/
`research-general`; `cite-apa7` untuk format sitasi; `write-academic-id` untuk penulisan
akademik Indonesia; `meta-analysis-synthesis`/`replication-readiness` bila relevan).

Sintesiskan bukti terverifikasi jadi jawaban terstruktur dan jujur: ringkasan temuan per
sub-pertanyaan, bukti tandingan & keterbatasan, lalu daftar sumber. Setiap klaim faktual
membawa penanda `[n]` yang memetakan ke sumber dari inventaris bukti. Nyatakan kekuatan bukti
secara eksplisit dan jaga perbedaan antar-sumber tetap terlihat.

**Disiplin sitasi:** hanya kutip sumber yang muncul di inventaris bukti run ini; pertahankan
nomor `[n]` persis; JANGAN pernah mengarang identifier. Gunakan verdict verifikasi sitasi untuk
menjaga kejujuran — untuk referensi yang ditandai, gunakan bahasa netral dan sarankan verifikasi
manual (sebuah flag BUKAN tuduhan); jangan membuang referensi hanya karena `unverifiable`.
Jika bukti tipis atau bertentangan, katakan demikian. Penomoran `[n]` yang stabil adalah
tanggung jawabmu sebagai penulis, bukan subagent.

## Catatan

- Berhenti saat bukti sudah cukup; jangan mencari tanpa henti.
- Bila pengguna ingin laporan disimpan sebagai dokumen, tawarkan `propose_artifact` setelah
  jawaban siap.
