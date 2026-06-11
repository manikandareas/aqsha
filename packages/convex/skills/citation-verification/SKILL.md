---
name: citation-verification
description: "Resep verifikasi sitasi 4-langkah (eksistensi, konsistensi metadata, validitas DOI/arXiv, aksesibilitas). Gunakan saat memeriksa apakah sitasi/daftar pustaka sebuah dokumen valid dan tidak fabrikasi."
license: Proprietary
metadata: { author: aqsha, version: "1.0", scope: builtin }
---
## Langkah
1. Eksistensi: cocokkan judul+penulis ke basis data akademik (OpenAlex/Crossref).
2. Konsistensi metadata: bandingkan penulis/tahun/venue yang dikutip vs record.
3. Identifier: resolve DOI (Crossref) dan arXiv ID; cocokkan judulnya.
4. Aksesibilitas: URL mati hanya menurunkan aksesibilitas, bukan validitas — langkah 1-3 yang menentukan.

## Penyajian
Penanda bukan tuduhan: bisa karena salah ketik metadata, basis data tidak lengkap, atau gangguan penyedia. Anjurkan verifikasi manual untuk item yang ditandai.
