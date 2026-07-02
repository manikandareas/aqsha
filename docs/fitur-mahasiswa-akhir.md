# Fitur untuk Mahasiswa Akhir (Skripsi/Tesis/R&D)

Target market: mahasiswa tingkat akhir Indonesia yang mengerjakan skripsi/tesis/R&D.

**Pembeda inti Aqsha** (arah semua fitur di bawah): _referensi asli, bukan halusinasi_ + _paham konvensi skripsi Indonesia_ + _terintegrasi (cari → nulis → sitasi dalam satu tempat)_. Inilah yang tak bisa ditiru ChatGPT/Gemini generik.

---

## 1. Slash command di composer

Paling cepat di-ship (nyambung ke composer + agent skills yang sudah ada).

### Mode metodologi
| Command | Fungsi | Why |
|---|---|---|
| `/kuantitatif` | Arahkan ke jalur kuantitatif: variabel, hipotesis, sampel, instrumen, uji statistik | Salah pilih pendekatan = revisi berbulan; ini pain terdalam |
| `/kualitatif` | Fenomenologi/studi kasus, informan, coding tematik, triangulasi | Idem, tapi paradigma berbeda total |
| `/campuran` · `/rnd` | Mixed methods · ADDIE/4D/Borg & Gall | Umum di prodi pendidikan & pengembangan produk |

### Penulisan per bab
| Command | Fungsi | Why |
|---|---|---|
| `/latarbelakang` | Alur fenomena → urgensi → gap | Bab 1 paling sering ditolak dosen |
| `/rumusanmasalah` · `/tujuan` · `/hipotesis` | Turunkan dari latar belakang | Konsistensi antar-bagian susah dijaga manual |
| `/kerangka` · `/pembahasan` · `/kesimpulan` | Kerangka teori, interpretasi, simpulan | Bagian yang butuh nalar, bukan sekadar isi |
| `/abstrak` | 250 kata + kata kunci, versi ID & EN | Wajib, format ketat, sering dikerjakan terakhir & buru-buru |

### Literatur (bekerja di atas library)
| Command | Fungsi | Why |
|---|---|---|
| `/gap` | Deteksi research gap dari paper di library | Titik stuck awal; pakai aset yang sudah dikumpulkan |
| `/matriks` | Tabel sintesis: Penulis (Tahun) · Metode · Sampel · Temuan · Relevansi | Tugas manual paling dibenci di Bab 2 |
| `/terdahulu` | Susun "penelitian terdahulu" pembanding | Turunan langsung dari matriks |

### Bahasa & sitasi
| Command | Fungsi | Why |
|---|---|---|
| `/akademik` · `/puebi` | Gaya ilmiah, kalimat efektif, ejaan baku | Banyak yang lemah bahasa akademik formal |
| `/sitasi` | Format APA dari paper terpilih | Format & konsistensi sitasi menyakitkan |
| `/parafrase` | Tulis ulang **dengan sitasi yang benar** | Framing etis (menulis ulang + mengutip), bukan akali Turnitin |

### Pertahanan
| Command | Fungsi | Why |
|---|---|---|
| `/sidang` | Simulasi pertanyaan dosen penguji dari draft | Peredam kecemasan sidang No.1 |
| `/reviewer` | Kritik tulisan seperti dosen pembimbing | Latihan revisi sebelum kena coret |

> **Starter set (rilis pertama, 7 command dampak tertinggi):** `/kuantitatif`, `/kualitatif`, `/matriks`, `/sitasi`, `/akademik`, `/parafrase`, `/sidang`.

**Catatan teknis:** command bisa (a) _prompt-template_ sisi client (cepat, cukup untuk penulisan) atau (b) dipetakan ke **agent skill** Mastra untuk yang butuh tool/library (mis. `/matriks`, `/sitasi`). Mulai dari (a), naikkan yang berat ke (b).

---

## 2. Fitur besar (bukan sekadar command)

Diurutkan berdasarkan dampak:

| # | Fitur | Why |
|---|---|---|
| 1 | **Cek Referensi Asli / anti-halusinasi** — verifikasi tiap sitasi benar ada (cross-check OpenAlex/Crossref/DOI), tandai referensi palsu/tak cocok | **Killer feature.** Ketakutan No.1: ketahuan pakai referensi karangan AI. Aqsha sudah punya Explore + citations, tinggal dibalik jadi validator |
| 2 | **Matriks Sintesis Literatur** — output tabel/artifact dari library | Menghapus tugas manual paling dibenci; langsung memakai aset yang sudah dikumpulkan → retensi kuat |
| 3 | **Asisten Metodologi (wizard)** — alur interaktif jenis → desain → sampel → instrumen → uji → draft Bab 3 | Metodologi = pain terdalam; slash `/kuantitatif` `/kualitatif` jadi pintu masuknya |
| 4 | **Kerangka Skripsi (outline Bab 1-5)** — scaffold struktur penuh, sadar template kampus (upload panduan penulisan) | Memberi struktur ke seluruh perjalanan; tiap kampus beda format |
| 5 | **Pemeriksa Bahasa Akademik Indonesia** — PUEBI/EYD, kata baku, kalimat efektif, konsistensi istilah | Beda dari grammar checker generik; sulit ditiru pesaing global |
| 6 | **Ekspor DOCX terformat kampus** — heading, daftar isi, daftar pustaka otomatis | Formatting akhir = rasa sakit nyata menjelang deadline |

---

## Rekomendasi MVP

**Starter-set slash command + Matriks Sintesis + Cek Referensi Asli.**

Alasan: slash command murah dan langsung terasa; dua fitur besar itu menegakkan pembeda inti Aqsha (referensi asli + integrasi library) yang tak bisa ditiru ChatGPT, sekaligus mengonsumsi data yang sudah dikumpulkan user.
