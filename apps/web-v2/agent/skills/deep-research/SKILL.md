---
description: Use when the user runs /deep or asks for a thorough, citation-verified research report. Plan first, delegate literature search and counter-evidence to subagents, then write a cited synthesis.
---

# Deep research

Metodologi untuk menjawab pertanyaan riset secara mendalam dan jujur. Kamu (root)
adalah orkestrator DAN penulis akhir. Alur di bawah adalah panduan, bukan loop kaku —
gunakan penilaianmu, berhenti saat bukti sudah cukup, dan sampaikan ketidakpastian apa
adanya.

## 1. Rencana lebih dulu (WAJIB, sebelum riset apa pun)

Uraikan pertanyaan menjadi 3-6 sub-pertanyaan yang fokus dan bisa ditelusuri terpisah,
lalu panggil tool **`propose_research_plan`** dengan judul, ringkasan singkat, dan array
sub-pertanyaan. JANGAN menulis rencana sebagai pesan chat — ajukan lewat tool agar user
bisa menyetujui/menolak.

- Tool ini di-PARK untuk persetujuan user. Tunggu hasilnya.
- Jika tool mengembalikan `{ ok: false, reason }` → kuota/akses deep research habis.
  Sampaikan ke user dengan ramah dan HENTIKAN — jangan riset.
- Jika user menolak rencana → batalkan, jangan riset.
- Hanya setelah `{ proposed: true }` (disetujui) lanjut ke telaah literatur.

## 2. Telaah literatur (delegasi paralel)

Untuk SETIAP sub-pertanyaan, delegasikan ke subagent **`literature-searcher`** — satu
instance per sub-pertanyaan; sub-pertanyaan yang independen boleh jalan paralel. Subagent
tidak melihat history-mu, jadi `message` harus memuat seluruh konteks: sub-pertanyaan
spesifik + instruksi mengembalikan sumber bernomor `[n]` dengan extract bukti. Set
`outputSchema` saat delegasi (mode task) agar hasil balik terstruktur.

Konsolidasikan temuan semua subagent menjadi satu inventaris bukti milikmu: per
sub-pertanyaan, tiap sumber berguna dengan judul, identifier (DOI/arXiv/URL), nomor sitasi
`[n]`, extract 2-4 kalimat, dan rating kekuatan bukti (strong/medium/weak).

## 3. Bukti tandingan (adversarial)

Delegasikan ke subagent **`counter-evidence`**, oper inventaris bukti di atas, untuk
mencari bukti yang MELEMAHKAN kesimpulan yang sedang terbentuk (replikasi gagal, studi
yang bertentangan, kritik metodologis, retraksi). Konsolidasikan hasilnya: tiap sanggahan
dengan `[n]` dan kekuatannya; laporkan jujur bila tak ada — ketiadaan sanggahan pun sebuah
hasil. Set `outputSchema` saat delegasi.

## 4. Tulis jawaban tercitasi (kamu, root)

Sintesiskan bukti terverifikasi menjadi jawaban yang terstruktur dan jujur: ringkasan
temuan per sub-pertanyaan, bukti tandingan & keterbatasan, lalu daftar sumber. Setiap klaim
faktual membawa penanda `[n]` yang memetakan ke sumber dari hasil tool. Nyatakan kekuatan
bukti secara eksplisit dan jaga agar perbedaan antar-sumber tetap terlihat.

Disiplin sitasi: hanya kutip sumber yang muncul di hasil tool selama run INI, pertahankan
nomor `[n]` dari hasil tool, JANGAN pernah mengarang identifier. Jika bukti tipis atau
bertentangan, katakan demikian — jangan memaksakan kepastian yang tak didukung bukti.

## Catatan

- Berhenti saat bukti sudah cukup; jangan mencari tanpa henti.
- Bila user ingin laporan disimpan sebagai dokumen, tawarkan `propose_artifact` setelah
  jawaban siap.
