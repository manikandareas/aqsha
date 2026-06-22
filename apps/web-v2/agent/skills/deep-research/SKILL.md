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
- Jika user menolak rencana **dengan revisi** (alasan penolakan berisi JSON rencana
  yang disunting, mis. `{ "title": ..., "questions": [...] }`) → panggil
  `propose_research_plan` LAGI dengan sub-pertanyaan revisi itu PERSIS (jangan
  mengarang ulang), lalu tunggu persetujuan. Ini cara user menyunting rencana.
- Jika user menolak TANPA revisi → batalkan, jangan riset.
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

## 4. Verifikasi sitasi (delegasi)

Sebelum menulis, delegasikan ke subagent **`citation-verifier`** untuk memeriksa
integritas referensi yang akan kamu kutip. Oper SELURUH daftar referensi sebagai satu
`message`: tiap referensi dengan judul, identifier (DOI/arXiv bila ada), penulis/tahun,
dan nomor `[n]`-nya. Set `outputSchema` (mode task). Subagent memanggil `verify_identifiers`
SEKALI atas seluruh daftar dan mengembalikan tabel verdict per-`[n]` (verified / metadata
mismatch / identifier invalid / not found / unverifiable).

Gunakan verdict untuk menjaga kejujuran: untuk referensi yang ditandai, gunakan bahasa
netral dan sarankan verifikasi manual — sebuah flag BUKAN tuduhan (bisa dari typo metadata,
basis data tak lengkap, atau gangguan provider). Jangan membuang referensi hanya karena
`unverifiable`. Jaga nomor `[n]` tetap konsisten dengan hasil tool riset.

## 5. Tulis jawaban tercitasi (kamu, root)

Pilih domain-pack yang relevan dan **`load_skill`** untuk metodologi + gaya penulisannya
SEBELUM menulis (mis. `research-medicine`/`research-cs-ml`/`research-education`/
`research-general` untuk metodologi domain; `cite-apa7` untuk format sitasi;
`write-academic-id` untuk penulisan akademik Indonesia; `meta-analysis-synthesis` /
`replication-readiness` bila relevan). Kamu (root) adalah penulis akhir — penomoran `[n]`
yang stabil adalah tanggung jawabmu, bukan subagent.

Sintesiskan bukti terverifikasi menjadi jawaban yang terstruktur dan jujur: ringkasan
temuan per sub-pertanyaan, bukti tandingan & keterbatasan, lalu daftar sumber. Setiap klaim
faktual membawa penanda `[n]` yang memetakan ke sumber dari hasil tool. Nyatakan kekuatan
bukti secara eksplisit dan jaga agar perbedaan antar-sumber tetap terlihat.

Disiplin sitasi: hanya kutip sumber yang muncul di hasil tool selama run INI, pertahankan
nomor `[n]` dari hasil tool, JANGAN pernah mengarang identifier. Jika bukti tipis atau
bertentangan, katakan demikian — jangan memaksakan kepastian yang tak didukung bukti.
Bila ingin pemeriksaan akhir atas draftmu, panggil `verify_citations` dengan teks draft.

## Catatan

- Berhenti saat bukti sudah cukup; jangan mencari tanpa henti.
- Bila user ingin laporan disimpan sebagai dokumen, tawarkan `propose_artifact` setelah
  jawaban siap.
