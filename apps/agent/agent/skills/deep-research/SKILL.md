---
description: Use when the user runs /deep or asks for a thorough, citation-verified research report. Gather context with ask_question first, present a prose plan, confirm via ask_question, then delegate literature search and counter-evidence to subagents and write a cited synthesis.
---

# Deep research

Metodologi untuk menjawab pertanyaan riset secara mendalam dan jujur. Kamu (root)
adalah orkestrator DAN penulis akhir. Alur di bawah adalah panduan, bukan loop kaku —
gunakan penilaianmu, berhenti saat bukti sudah cukup, dan sampaikan ketidakpastian apa
adanya.

**Klarifikasi & konfirmasi rencana** memakai tool built-in **`ask_question`** — user
menjawab lewat kartu di atas composer (opsi) atau teks bebas di composer (`allowFreeform`).
Setiap panggilan `ask_question` **mengakhiri turn-mu** sampai user menjawab; jangan
menumpuk banyak pertanyaan dalam teks biasa lalu berharap user menjawab sekaligus.

## 1. Gali konteks dulu (JANGAN langsung membuat rencana)

Saat `/deep` dimulai, JANGAN langsung menyusun rencana atau meriset. Pertama:

- Beri tanggapan singkat yang menunjukkan kamu memahami topiknya (1-2 kalimat di teks).
- Panggil **`ask_question`** untuk menggali konteks yang masih kurang. Satu panggilan per
  turn — turn parkir sampai user menjawab.

**Apa yang perlu digali** (pilih yang relevan, jangan memaksakan semuanya):

- Tujuan/penggunaan hasil riset
- Batasan: rentang tahun, populasi, domain, geografi
- Kedalaman yang diinginkan (survey cepat vs tinjauan sistematis)
- Definisi istilah yang ambigu
- Sudut pandang yang harus / tak boleh disertakan

**Cara memakai `ask_question`:**

- **`prompt`**: satu pertanyaan jelas, spesifik, dalam bahasa user.
- **`options`**: tawarkan 3-5 pilihan umum bila membantu mempersempit ruang lingkup (mis.
  rentang tahun, jenis sumber, audiens). Setiap opsi punya `id` singkat + `label` ramah.
- **`allowFreeform: true`** hampir selalu — user boleh menjawab di luar opsi lewat composer.
- Bila topik user **sudah sangat spesifik**, satu `ask_question` konfirmasi singkat cukup
  (mis. "Apakah fokus X sudah tepat, atau ada batasan lain?") — jangan memaksakan tiga
  putaran.

**Putaran lanjutan:** setelah user menjawab, evaluasi apakah konteks sudah cukup. Bila masih
ada celah penting, panggil `ask_question` lagi (maks. 2-3 putaran total untuk gali konteks).
Bila sudah cukup → langsung ke langkah 2. **Jangan meriset apa pun** sebelum rencana
disetujui.

Contoh opsi untuk pertanyaan ruang lingkup:

```json
{
  "prompt": "Rentang tahun mana yang paling relevan untuk tinjauan ini?",
  "options": [
    { "id": "5y", "label": "5 tahun terakhir" },
    { "id": "10y", "label": "10 tahun terakhir" },
    { "id": "classic", "label": "Termasuk studi klasik/landmark" },
    { "id": "open", "label": "Tanpa batas tahun khusus" }
  ],
  "allowFreeform": true
}
```

## 2. Sajikan rencana sebagai PROSA + minta konfirmasi

Setelah konteks cukup, susun rencana riset sebagai **teks deskriptif mengalir** (prosa),
BUKAN daftar Q1-Q5 dan BUKAN form. Jelaskan dalam beberapa kalimat: apa yang akan kamu
selidiki, sub-arah/aspek utama yang akan ditelusuri terpisah, jenis sumber yang dicari, dan
bagaimana kamu akan memverifikasi.

Lalu panggil **`ask_question`** untuk konfirmasi rencana — jangan hanya minta "ya/tidak"
lewat teks tanpa tool:

```json
{
  "prompt": "Boleh saya mulai riset dengan rencana di atas, atau ada yang ingin disesuaikan?",
  "options": [
    { "id": "proceed", "label": "Ya, lanjutkan riset", "style": "primary" },
    { "id": "revise", "label": "Revisi rencana dulu" },
    { "id": "cancel", "label": "Batalkan", "style": "danger" }
  ],
  "allowFreeform": true
}
```

- Jawaban **proceed** / setara ("ya", "lanjut", "boleh") → langkah 3.
- Jawaban **revise** atau teks bebas berisi masukan → perbarui rencana prosa, konfirmasi
  lagi dengan `ask_question` (boleh opsi yang sama).
- Jawaban **cancel** / batalkan → hentikan, jangan riset.

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
- Bila user ingin laporan disimpan sebagai dokumen, tawarkan `propose_artifact` setelah
  jawaban siap (konfirmasi lewat percakapan atau `ask_question` bila perlu).
