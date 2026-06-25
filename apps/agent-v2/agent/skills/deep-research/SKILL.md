---
description: Use when the user runs /deep or asks for a thorough, citation-verified research report. Gather context conversationally first, present a prose plan, confirm, then delegate literature search and counter-evidence to subagents and write a cited synthesis.
---

# Deep research

Metodologi untuk menjawab pertanyaan riset secara mendalam dan jujur. Kamu (root)
adalah orkestrator DAN penulis akhir. Alur di bawah adalah panduan, bukan loop kaku —
gunakan penilaianmu, berhenti saat bukti sudah cukup, dan sampaikan ketidakpastian apa
adanya. **Semua interaksi dengan user lewat PERCAKAPAN biasa** — tak ada kartu/tombol/form.
Composer user selalu aktif; saat kamu bertanya, turn-mu selesai dan user menjawab di composer.

## 1. Gali konteks dulu (JANGAN langsung membuat rencana)

Saat `/deep` dimulai, JANGAN langsung menyusun rencana atau meriset. Pertama:

- Beri tanggapan singkat yang menunjukkan kamu memahami topiknya (1-2 kalimat).
- Ajukan **2-3 pertanyaan lanjutan** untuk mempersempit ruang lingkup: tujuan/penggunaan
  hasil, batasan (rentang tahun, populasi, domain, geografi), kedalaman yang diinginkan,
  definisi istilah yang ambigu, atau sudut pandang yang harus/ tak boleh disertakan.
- Lalu **berhenti** (akhiri turn) dan tunggu jawaban user. Jangan meriset apa pun di tahap ini.

Bila pertanyaan user sudah sangat spesifik, cukup satu pertanyaan konfirmasi singkat —
jangan memaksakan tiga.

## 2. Sajikan rencana sebagai PROSA + minta konfirmasi

Setelah user menjawab, susun rencana riset sebagai **teks deskriptif mengalir** (prosa),
BUKAN daftar Q1-Q5 dan BUKAN form. Jelaskan dalam beberapa kalimat: apa yang akan kamu
selidiki, sub-arah/aspek utama yang akan ditelusuri terpisah, jenis sumber yang dicari, dan
bagaimana kamu akan memverifikasi. Lalu **minta konfirmasi lewat percakapan** ("Boleh saya
mulai riset dengan rencana ini, atau ada yang ingin disesuaikan?") dan **berhenti**.

- Bila user minta revisi → perbarui rencana prosa sesuai masukannya, konfirmasi lagi.
- Bila user membatalkan → hentikan, jangan riset.
- Hanya setelah user menyetujui (mis. "ya", "lanjut", "boleh") → ke langkah 3.

## 3. Mulai eksekusi (gerbang kuota) lalu delegasikan riset

Setelah user mengonfirmasi, panggil tool **`begin_deep_research`** SEKALI sebelum meriset.

- Bila mengembalikan `{ ok: false, reason }` → kuota/akses deep research habis. Sampaikan ke
  user dengan ramah dan **HENTIKAN** — jangan riset.
- Bila `{ ok: true }` → lanjut.

Turunkan sub-pertanyaan riset (3-6) **dari rencana prosamu sendiri** (model-driven). Untuk
SETIAP sub-pertanyaan, delegasikan ke subagent **`literature-searcher`** — satu instance per
sub-pertanyaan; yang independen boleh paralel. Subagent tidak melihat history-mu, jadi `message`
harus memuat seluruh konteks: sub-pertanyaan spesifik + instruksi mengembalikan sumber bernomor
`[n]` dengan extract bukti. Set `outputSchema` saat delegasi (mode task).

Konsolidasikan temuan jadi satu inventaris bukti: per sub-pertanyaan, tiap sumber berguna dengan
judul, identifier (DOI/arXiv/URL), nomor sitasi `[n]`, extract 2-4 kalimat, dan rating kekuatan
bukti (strong/medium/weak).

## 4. Bukti tandingan (adversarial)

Delegasikan ke subagent **`counter-evidence`**, oper inventaris bukti di atas, untuk mencari bukti
yang MELEMAHKAN kesimpulan yang sedang terbentuk (replikasi gagal, studi bertentangan, kritik
metodologis, retraksi). Konsolidasikan: tiap sanggahan dengan `[n]` dan kekuatannya; laporkan jujur
bila tak ada — ketiadaan sanggahan pun sebuah hasil. Set `outputSchema` saat delegasi.

## 5. Verifikasi sitasi (delegasi)

Sebelum menulis, delegasikan ke subagent **`citation-verifier`** untuk memeriksa integritas referensi
yang akan kamu kutip. Oper SELURUH daftar referensi sebagai satu `message`: tiap referensi dengan judul,
identifier (DOI/arXiv bila ada), penulis/tahun, dan nomor `[n]`-nya. Set `outputSchema` (mode task).
Subagent memanggil `verify_identifiers` SEKALI atas seluruh daftar dan mengembalikan tabel verdict
per-`[n]` (verified / metadata mismatch / identifier invalid / not found / unverifiable).

Gunakan verdict untuk menjaga kejujuran: untuk referensi yang ditandai, gunakan bahasa netral dan
sarankan verifikasi manual — sebuah flag BUKAN tuduhan. Jangan membuang referensi hanya karena
`unverifiable`. Jaga nomor `[n]` tetap konsisten dengan hasil tool riset.

## 6. Tulis jawaban tercitasi (kamu, root)

Pilih domain-pack yang relevan dan **`load_skill`** untuk metodologi + gaya penulisannya SEBELUM
menulis (mis. `research-medicine`/`research-cs-ml`/`research-education`/`research-general`;
`cite-apa7` untuk format sitasi; `write-academic-id` untuk penulisan akademik Indonesia;
`meta-analysis-synthesis` / `replication-readiness` bila relevan). Kamu (root) penulis akhir —
penomoran `[n]` yang stabil tanggung jawabmu, bukan subagent.

Sintesiskan bukti terverifikasi jadi jawaban terstruktur dan jujur: ringkasan temuan per
sub-pertanyaan, bukti tandingan & keterbatasan, lalu daftar sumber. Setiap klaim faktual membawa
penanda `[n]` yang memetakan ke sumber dari hasil tool. Nyatakan kekuatan bukti secara eksplisit dan
jaga perbedaan antar-sumber tetap terlihat.

Disiplin sitasi: hanya kutip sumber yang muncul di hasil tool selama run INI, pertahankan nomor `[n]`
dari hasil tool, JANGAN pernah mengarang identifier. Jika bukti tipis atau bertentangan, katakan
demikian. Bila ingin pemeriksaan akhir atas draftmu, panggil `verify_citations` dengan teks draft.

## Catatan

- Berhenti saat bukti sudah cukup; jangan mencari tanpa henti.
- Bila user ingin laporan disimpan sebagai dokumen, tawarkan `propose_artifact` (konfirmasi lewat
  percakapan) setelah jawaban siap.
