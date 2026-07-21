# Spesifikasi — Agent Typst, Composer, Proposal, dan Anotasi Proyek

**Status:** disepakati untuk implementasi

**Tanggal:** 21 Juli 2026

## Ringkasan

Astra menjadi asisten yang sadar proyek pada halaman proyek Typst. Ia memperoleh manifest kecil proyek aktif pada setiap turn tanpa menambahkan chip ke composer, lalu memakai tool untuk membaca source Typst terbaru, mencari artefak proyek melalui RAG, dan membuat proposal suntingan yang aman. Ia tidak pernah menulis source resmi secara langsung.

Proposal ditinjau sebagai unified diff bergaya Git di Editor: penghapusan merah, penambahan hijau, dan setiap hunk dapat dipilih secara mandiri. Preview tetap menampilkan dokumen tersimpan; sebuah banner hanya menawarkan aksi **Tinjau usulan**. Anotasi menjadi konteks composer otomatis sampai delapan item, tetap terlihat sampai dibersihkan, dan dapat dibersihkan dengan countdown tiga detik yang dapat dibatalkan.

## Temuan yang menjadi dasar desain

- Preview Typst saat ini dirender menjadi SVG oleh Worker. `typst.ts` tidak menyediakan pemetaan span SVG ke baris source Typst, sehingga track-changes presisi pada preview akan menyesatkan.
- CodeMirror sudah menjadi editor source Typst, dan `ProposalReviewCard.svelte` sudah merender unified diff serta pilihan hunk. Ini adalah tempat yang tepat untuk red/green review.
- `get_document_source` dan `propose_document_edit` sudah mengikat dokumen ke `workspaceId` pada thread dan sudah melakukan dry-run compile. Pekerjaan ini memperkuat lifecycle, context default, dan pengalaman review.
- Runtime Worker Typst harus dipertahankan: main thread hanya memasang SVG dan menangani UI.

## Sasaran produk

1. Astra dapat membaca source Typst dan anotasi proyek aktif, serta mengajukan patch Typst tervalidasi compile.
2. Proyek aktif menyediakan context default tanpa `@mention` dan tanpa pill composer otomatis.
3. `@mention` tetap dapat membuka proyek/dokumen lain yang dimiliki user sebagai context baca prioritas; target itu tidak dapat dipatch dari thread proyek aktif.
4. RAG default dibatasi ke artefak proyek aktif dan dipakai bila relevan; Citation Library global hanya dipakai bila user memintanya atau sumber proyek tidak cukup.
5. Proposal tidak mengubah dokumen sebelum user menyelesaikan review; hanya satu proposal pending per proyek dan proposal baru tidak boleh menimpa proposal lama secara diam-diam.
6. Anotasi dapat ditandai sebagai context, kemudian disembunyikan dari preview lewat Clear yang dapat dibatalkan selama tiga detik tanpa menghapus chip atau riwayat turn.

## Kontrak perilaku

### Context proyek dan `@mention`

| Situasi | Context yang diberikan | Izin Astra |
| --- | --- | --- |
| Chat dari halaman proyek | Manifest ringkas proyek aktif, versi dokumen, dan petunjuk tool. Tidak ada pill composer. | Read Typst aktif, RAG artefak proyek, bibliografi proyek, lalu proposal patch dokumen aktif. |
| `@mention` dokumen | Context mention menjadi prioritas; agent membaca artifact itu lebih dahulu. | Read-only kecuali artifact tersebut adalah dokumen aktif yang memang dituju tool Typst. |
| `@mention` proyek lain | ID proyek menjadi scope RAG tambahan setelah mention dibaca. | Read-only, dibatasi owner user yang sama. |
| Tanpa evidence yang cukup dari proyek | Agent menyatakan kekurangan dan baru memakai Citation Library global atau web bila diminta/benar-benar diperlukan. | Read-only sesuai tool yang ada. |

Manifest tidak memuat seluruh source atau seluruh daftar referensi. Ia hanya memberi identitas dan ketersediaan sumber agar biaya prompt stabil. Source penuh dibaca lewat `get_document_source` bila diperlukan, dan RAG mengambil cuplikan relevan saja.

### Lifecycle proposal Typst

1. Untuk permintaan edit, Astra wajib memanggil `get_document_source` untuk mendapatkan source terbaru, version, dan anotasi terbuka/terkirim.
2. Ia mengajukan `propose_document_edit` dengan pasangan `oldText` unik → `newText`, atau `fullSource` untuk dokumen kosong/tulis ulang. Tool menerima `resubmitInstruction` ringkas yang akan dipakai jika proposal basi.
3. Server menerapkan patch pada salinan, menyusun BibTeX proyek, lalu dry-run compile. Compile gagal atau anchor tidak unik menghasilkan union yang dapat dipakai Astra untuk memperbaiki proposal.
4. Astra boleh mencoba maksimal tiga proposal pada satu turn edit. Upaya keempat mengembalikan `retry_exhausted`; source asli tetap tidak berubah.
5. Hanya candidate yang compile bersih dapat masuk status `pending`. Jika sudah ada pending proposal, tool mengembalikan `pending_proposal` sebelum compile baru dan Astra meminta user menyelesaikannya.
6. Proposal sukses memunculkan CTA **Tinjau usulan** di respons Astra, badge `Editor (n)`, dan banner preview. Tidak ada perpindahan panel otomatis.
7. User menekan Tinjau untuk membuka reviewer read-only. Ia menentukan semua hunk melalui checkbox, lalu menekan Terima atau Tolak. Terima subset selalu compile kembali sebelum save.
8. Jika source berubah lewat editor/manual save, proposal menjadi **Basi**. User dapat Tolak atau **Minta Astra susun ulang**; aksi kedua menolak proposal lama, mengisi composer dengan `resubmitInstruction`, dan membuka Chat tanpa mengirim otomatis.
9. Accept menyimpan dengan CAS, menutup reviewer di panel saat ini, refresh preview, dan menandai anotasi yang dijawab sebagai `resolved`. Reject menutup reviewer dan membiarkan anotasi kembali `open` sampai user membersihkannya sendiri.

### Review diff

- Review tidak mengubah buffer source atau SVG preview sebelum Accept.
- Setiap hunk memiliki checkbox; semua dipilih sebagai default. Tidak ada hunk yang tertinggal pending setelah user menekan Terima/Tolak.
- Label hunk memakai heading Typst terdekat sebelum `oldStart` (misalnya `= Pendahuluan`); fallbacknya adalah rentang baris sumber.
- Warna hanya berlaku pada diff: `-` coral/red dan `+` mint/green. Ini bukan representasi perubahan di preview Typst.
- Di mobile, Tinjau berpindah ke tab Editor dan reviewer memakai seluruh panel; Preview tetap tab terpisah.

### Annotation dan Clear

- Setelah menambah anotasi dalam mode aktif, mode tetap aktif agar user dapat membuat batch anotasi.
- Anotasi baru selalu disimpan. Bila chip anotasi di composer kurang dari delapan, anotasi langsung ditambahkan sebagai chip dengan counter `n/8`; setelah batas, anotasi tetap dibuat namun user diberi notifikasi bahwa context perlu dilepas terlebih dahulu.
- Highlight `open` dan `sent` tetap tampil. `resolved` dan `dismissed` tidak ditampilkan.
- Toolbar anotasi muncul saat mode aktif di kanan bawah dan berisi toggle mode serta aksi Clear untuk seluruh anotasi terlihat.
- Klik Clear mengambil snapshot ID anotasi `open`/`sent`, menampilkan progress tiga detik dekat tombol Clear, dan menampilkan **Batal**. Toolbar serta mode anotasi tetap terbuka.
- Bila timer selesai, snapshot diubah menjadi `dismissed` secara batch. Chip composer dan context yang sudah terkirim tidak disentuh; riwayat tetap utuh.
- Bila Batal ditekan sebelum tiga detik, tidak ada request dismiss. Anotasi baru yang dibuat selama countdown tidak ikut snapshot tersebut.

## Batasan dan non-goals

- Tidak ada track-changes inline pada SVG preview, source-to-SVG mapping, atau modifikasi renderer Typst.
- Tidak ada direct write tool untuk Astra; seluruh patch selalu proposal.
- Tidak ada patch ke proyek atau dokumen lain yang hanya di-mention.
- Tidak ada multiple pending proposal per proyek dan tidak ada supersede otomatis.
- Tidak ada penghapusan permanen anotasi dari aksi Clear; endpoint DELETE tetap ada untuk aksi eksplisit lain yang sudah tersedia.
- Tidak menambah library diff, editor, atau annotation baru. Gunakan CodeMirror, `diff`, TanStack Query, dan komponen UI yang sudah ada.

## Kriteria penerimaan

1. Chat proyek baru dapat langsung menjawab atau mengedit dengan scope proyek aktif tanpa pill workspace terlihat dan tanpa gagal karena thread belum terproyeksi.
2. Astra dapat membaca source Typst aktif, mencari artifact proyek dengan RAG, dan memprioritaskan dokumen/proyek yang di-mention oleh user.
3. Proposal dengan dua perubahan terpisah tampil sebagai dua hunk berlabel section; user dapat menerima satu dan melewati satu lainnya bila hasil gabungan compile.
4. Pending proposal kedua tidak mengubah status proposal pertama dan Astra meminta user menyelesaikannya.
5. Preview menampilkan banner Tinjau saja; dokumen preview tetap source tersimpan sampai Accept.
6. Editor toggle menampilkan jumlah hunk pada desktop dan mobile ketika proposal aktif.
7. Manual save saat proposal pending menandainya basi; Minta Astra susun ulang tidak mengirim pesan atau mengubah dokumen secara otomatis.
8. Clear menunjukkan progress tiga detik, Batal mencegah dismiss, dan penyelesaian timer menyembunyikan hanya anotasi snapshot tanpa menghapus chip composer.
9. Accept menandai anotasi terkait `resolved`; Reject membukanya lagi; semua operasi tetap terisolasi owner dan workspace.
