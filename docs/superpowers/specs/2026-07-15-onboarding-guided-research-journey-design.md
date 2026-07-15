# Redesign Onboarding — Guided Research Journey

- **Tanggal:** 2026-07-15
- **Status:** Menunggu review user
- **Scope:** `apps/svelte/src/routes/onboarding` dan presentation layer feature onboarding

## Ringkasan

Onboarding Aqsha akan diubah dari wizard form yang terasa standar menjadi **Guided Research Journey**: perjalanan singkat yang mengajak pengguna mulai dari satu ide, mengarahkan rasa penasaran menjadi research, lalu masuk ke ruang kerja utama Aqsha.

Semua data yang saat ini diminta tetap dipertahankan. Perubahan berfokus pada narrative arc, hierarchy, motion, personalisasi finish, dan kualitas pengalaman visual. Design spec ini sengaja tidak mengunci metafora, bentuk, atau susunan elemen visual tertentu. Implementasi mendapat ruang eksplorasi selama memenuhi prinsip pengalaman yang disepakati.

Setelah onboarding selesai, pengguna dinavigasi ke `/app`, bukan `/app/explore`.

## Tujuan

- Membuat onboarding terasa memikat dan memorable tanpa menjadi teatrikal atau berlebihan.
- Membantu pengguna merasa bahwa mereka tidak perlu memiliki topik atau jawaban sempurna untuk mulai.
- Menjelaskan perbedaan Aqsha: membantu mencari dan memeriksa, sementara keputusan intelektual tetap milik pengguna.
- Mengintegrasikan storytelling tipis pada setiap langkah tanpa memperpanjang waktu penyelesaian secara berarti.
- Mempertahankan semua data, validasi, dan kontrak backend onboarding saat ini.
- Memberikan finish yang personal dan menyambung alami ke pengalaman membuat thread baru di `/app`.

## Non-tujuan

- Tidak menambah pertanyaan onboarding baru.
- Tidak mengubah schema database, payload API, atau kontrak service onboarding.
- Tidak menetapkan ilustrasi, metafora visual, komposisi layout, atau bentuk motion tertentu di tahap design spec.
- Tidak membuat palette atau font baru khusus onboarding.
- Tidak mengubah starting experience `/app` di luar seam yang diperlukan untuk navigasi dari onboarding.
- Tidak menambahkan analytics atau eksperimen onboarding baru dalam scope ini.

## Baseline Saat Ini

Flow saat ini memiliki lima state:

1. `welcome`
2. `background`
3. `interests`
4. `source`
5. `finish`

Tiga question step mengumpulkan:

- `background`
- Minimal tiga `interests`
- `heardAboutSource`
- `heardAboutOther` ketika source adalah `lainnya`

Fondasi teknis yang ada sudah tepat: state per instance, pure step machine, validasi terpisah, mutation terpusat, dan komponen per langkah. Masalah utama berada pada presentation layer: canvas selalu sempit dan terpusat, narrative arc belum terbentuk, serta finish belum menjelaskan mengapa Aqsha berbeda atau mengapa jawaban pengguna bermakna.

## Prinsip Pengalaman

### 1. Mulai sebelum merasa siap

Pesan emosional utamanya adalah:

> Kamu tidak harus tahu semuanya untuk mulai.

Aqsha menemani perjalanan dari ide yang belum rapi menuju pertanyaan, research, temuan, dan karya yang dapat dipertanggungjawabkan.

### 2. Sweet and spicy

Tone tetap hangat, suportif, dan menggunakan kata ganti “kamu”, tetapi tidak lembek. Copy berani mempertanyakan budaya jawaban instan dan mengingatkan bahwa sesuatu yang terdengar meyakinkan belum tentu benar.

Tone tidak boleh:

- Menggurui atau menguji kecerdasan pengguna.
- Menjanjikan bahwa Aqsha otomatis menghasilkan research yang benar.
- Menggambarkan AI sebagai pengganti penilaian pengguna.
- Menggunakan jargon akademik yang membuat langkah pertama terasa berat.

### 3. Storytelling sebagai lapisan, bukan hambatan

Storytelling hadir pada welcome, setiap question step, dan finish. Pertanyaan serta pilihan tetap menjadi fokus utama dan harus mudah dipindai. Target pengalaman tetap sekitar satu menit.

### 4. Mindblowing tanpa lebay

Kualitas “wow” datang dari satu pengalaman visual yang kohesif dan bermakna sepanjang flow, bukan dari kumpulan efek. Implementasi bebas mengeksplorasi bentuknya, tetapi tidak menggunakan confetti, 3D spectacle, parallax berlebihan, atau motion dekoratif yang tidak menjelaskan perubahan state.

## Narrative Arc dan Copy Direction

Copy di bawah adalah direction yang disetujui. Implementation plan boleh memecahnya ke model konten atau komponen yang sesuai, tetapi tidak mengubah intent tanpa persetujuan baru.

### Welcome — kamu tidak harus tahu semuanya

Kutipan asli:

> “The first principle is that you must not fool yourself—and you are the easiest person to fool.”
>
> — Richard Feynman

Sumber kutipan: pidato commencement Caltech tahun 1974, dirujuk oleh [Caltech Magazine](https://magazine.caltech.edu/post/feynman-at-100).

Kutipan tetap ditampilkan dalam English. Setelahnya, Aqsha memberi interpretasi singkat dalam bahasa Indonesia, bukan menerjemahkan kutipan secara literal:

> Sesuatu yang terdengar meyakinkan belum tentu benar. Aqsha membantu mencari dan memeriksa; kamu tetap menentukan apa yang layak dipercaya.

Headline:

> **Kamu nggak harus tahu semuanya untuk mulai.**

Supporting copy:

> Bawa satu ide yang masih mentah. Kita akan mencari pertanyaan, sumber, dan arah berikutnya bersama.

Primary CTA:

> **Mulai dari satu ide**

### Background — titik berangkat

Narrative bridge:

> Setiap perjalanan research punya titik berangkat yang berbeda.

Pertanyaan tetap meminta `background`, dengan seluruh pilihan saat ini dipertahankan.

### Interests — arah rasa penasaran

Narrative bridge:

> Di antara sekitar 320 juta karya ilmiah, mari mulai dari hal yang benar-benar membuatmu penasaran.

Pertanyaan tetap meminta minimal tiga `interests`. Copy jumlah pilihan harus menunjukkan progress tanpa memberi kesan ada maksimum pilihan bila produk memang tidak menerapkannya.

Klaim harus ditulis sebagai **“sekitar 320 juta karya ilmiah”** atau **“menelusuri katalog sekitar 320 juta karya ilmiah”**. Jangan menulis “akses penuh ke 320 juta paper”, karena katalog OpenAlex mencakup berbagai scholarly works dan tidak semuanya menyediakan full text. Angka merupakan pembulatan dari statistik OpenAlex yang berubah dari waktu ke waktu; rujukan saat design: [OpenAlex Data Stats](https://explore.openalex.org/stats).

### Source — awal perkenalan

Pertanyaan atribusi tidak dipaksakan menjadi metafora research.

Narrative bridge:

> Sebelum kita mulai—dari mana kamu menemukan Aqsha?

Seluruh pilihan source, randomization policy yang ada, dan input conditional “Lainnya” dipertahankan.

### Finish — rasa penasaranmu sekarang punya arah

Headline:

> **Rasa penasaranmu sekarang punya arah.**

Finish memantulkan jawaban pengguna dalam bahasa manusia, bukan ID internal. Format dasarnya:

> Titik berangkatmu: **{backgroundLabel}**. Rasa penasaranmu: **{interestLabels}**. Aqsha siap membantu mencari dan memeriksa; keputusan akhirnya tetap milikmu.

Aturan tampilan minat:

- Tampilkan maksimal tiga label minat secara eksplisit.
- Bila pengguna memilih lebih dari tiga, tambahkan “dan {n} bidang lain”.
- Jangan menghasilkan rekomendasi topik atau klaim personal yang tidak dapat disimpulkan dari jawaban.

Primary CTA:

> **Mulai research**

CTA dan navigasi setelah finish menuju `/app`.

## Prinsip UI

- Onboarding menggunakan ruang layar lebih ekspresif dan tidak lagi dibatasi pada pengalaman form standar `max-w-xl`.
- Narrative dan pertanyaan memiliki hierarchy jelas; storytelling tidak mengurangi keterbacaan pilihan.
- Seluruh warna berasal dari semantic tokens di `apps/svelte/src/styles/globals.css`.
- Tidak ada hardcoded palette atau onboarding-only color system.
- Typography menggunakan `font-heading`, `font-sans`, `font-mono`, dan `font-hand` yang sudah tersedia. `font-hand` hanya digunakan sebagai aksen terbatas.
- Light mode dan dark mode sama-sama merupakan first-class experience.
- Layout harus tetap nyaman untuk daftar opsi terpanjang dan viewport mobile pendek.
- Primary action tidak boleh terpotong atau sulit ditemukan pada mobile.
- Bentuk elemen visual, komposisi, dan metafora tidak ditentukan dalam spec ini.

## Prinsip Motion

- Gunakan satu bahasa motion konsisten untuk menunjukkan progress dan perubahan state.
- Motion harus memperjelas hubungan antarlangkah, bukan sekadar menghias perpindahan.
- Finish menjadi momen visual terkuat karena menyatukan jawaban pengguna dan membuka `/app`.
- `prefers-reduced-motion` harus menghasilkan pengalaman lengkap tanpa bergantung pada animasi.
- Perubahan ukuran konten antarstep tidak boleh menyebabkan tombol aksi meloncat secara mengganggu.
- Jangan menggunakan confetti atau motion perayaan generik.

## Arsitektur Komponen

### Orchestrator

`OnboardingPage.svelte` tetap bertanggung jawab atas:

- Query status onboarding.
- Memilih step yang aktif.
- Menangani back dan primary action.
- Submit mutation.
- Menampilkan submit error.
- Navigasi ke `/app`.

Orchestrator tidak menjadi tempat penyimpanan seluruh narrative copy atau display-label logic.

### State dan machine

`state.svelte.ts` tetap memiliki answers dan mutation per component instance.

`lib/onboarding-machine.ts` tetap menjadi sumber kebenaran untuk:

- Urutan step.
- Question-step progress.
- Validasi.
- Back/advance targets.
- Primary labels.
- `HOME_AFTER_ONBOARDING`, yang berubah menjadi `/app`.

### Content dan display model

Storytelling dan quote metadata diletakkan dalam model konten terstruktur atau boundary komponen yang jelas. Display label untuk reflection finish berasal dari option definitions, bukan duplikasi string baru.

Helper personalisasi finish harus:

- Menerima `OnboardingAnswers`.
- Mengembalikan label yang siap dirender.
- Menangani lebih dari tiga minat secara deterministik.
- Tidak bergantung pada Svelte runes agar mudah diuji.

### Step components

Komponen per langkah tetap terpisah. Setiap unit memiliki satu tanggung jawab:

- Menyajikan narrative context langkah tersebut.
- Menampilkan pertanyaan dan pilihan.
- Mengirim intent selection ke parent/state.

Tidak ada perubahan kontrak data antara step components dan flow state kecuali yang benar-benar diperlukan untuk presentation.

## Data Flow

1. Halaman meminta status onboarding.
2. Pengguna yang sudah selesai langsung dinavigasi ke `/app` dengan replace-state semantics.
3. Pengguna baru masuk ke `welcome` setelah status siap, tanpa flash wizard yang akan segera ditinggalkan.
4. Jawaban disimpan lokal ketika pengguna bergerak maju atau mundur.
5. `background`, minimal tiga `interests`, dan source valid sebelum pengguna dapat maju atau submit.
6. Data dikirim hanya setelah langkah source valid.
7. Finish hanya tampil setelah mutation berhasil.
8. Cache onboarding status diperbarui sinkron agar gate `/app` tidak memantulkan pengguna kembali ke onboarding.
9. CTA finish menavigasi ke `/app` dengan replace-state semantics.

Payload tetap:

```ts
{
  background: string;
  interests: string[];
  heardAboutSource: string;
  heardAboutOther?: string;
}
```

## Error Handling

- Submit failure mempertahankan step aktif dan seluruh jawaban.
- Error message menggunakan `readableApiErrorMessage(error, fallback)`.
- Raw `error.message` tidak pernah ditampilkan.
- Primary action disabled ketika mutation pending untuk mencegah request ganda.
- Retry menggunakan jawaban yang sama dan tidak me-reset flow.
- Conditional input “Lainnya” mempertahankan nilainya selama pengguna belum meninggalkan flow.
- Initial status-query failure menampilkan recoverable error state dengan retry; jangan melakukan redirect atau menganggap status completed.
- Error diletakkan cukup dekat dengan aksi yang gagal dan diumumkan secara aksesibel.

## Accessibility

- Seluruh flow dapat diselesaikan hanya dengan keyboard.
- Setiap step memiliki heading yang jelas dan urutan heading yang valid.
- Quote menggunakan semantic `blockquote` dan attribution yang dapat dipahami screen reader.
- Single-select dan multi-select mempertahankan state semantics seperti `aria-pressed` atau pola control setara yang valid.
- Focus berpindah secara masuk akal saat step berubah tanpa melakukan focus stealing yang mengejutkan.
- Focus indicator memakai token ring yang ada.
- Error update diumumkan melalui live region yang sesuai.
- Progress tidak disampaikan melalui warna atau motion saja.
- Kontras diuji pada light dan dark mode.

## Testing Strategy

### Unit tests

- Urutan question steps tetap `background → interests → source`.
- Background wajib dipilih.
- Interests tetap minimal tiga.
- Source wajib dipilih; `lainnya` membutuhkan free text non-kosong.
- Payload backend tidak berubah.
- `HOME_AFTER_ONBOARDING` adalah `/app`.
- Display-label helper memetakan seluruh background dan interest IDs yang valid.
- Finish menampilkan maksimal tiga minat dan menghitung sisa dengan benar.
- Unknown background ID menghasilkan `null` dan membuat clause background di finish dihilangkan.
- Unknown interest IDs diabaikan; bila tidak ada label valid yang tersisa, gunakan copy generik “bidang yang kamu pilih”.

### Interaction tests

- Back navigation mempertahankan jawaban.
- Keyboard dapat memilih opsi, maju, mundur, submit, dan membuka `/app`.
- Submit sukses menampilkan personalized finish.
- Submit gagal mempertahankan pilihan dan memungkinkan retry.
- Pengguna completed yang membuka `/onboarding` diarahkan ke `/app`.
- Source “Lainnya” menampilkan input, menerima focus setelah aksi pengguna, dan tervalidasi.

### Visual verification

- Mobile viewport pendek tidak memotong primary CTA.
- Step dengan opsi terbanyak tidak overflow secara horizontal.
- Light mode dan dark mode hanya menggunakan token yang ada.
- Reduced-motion path tetap kohesif.
- Perpindahan antara step dengan tinggi berbeda tidak menggeser action row secara mengganggu.
- Finish personalized tetap terbaca untuk label minat terpanjang.

### Repository gates

Jalankan dari root menggunakan Bun:

```bash
bun run lint
bun run typecheck
bun run test
bun run build
```

## Acceptance Criteria

- Semua data onboarding lama tetap diminta dan disimpan.
- Tidak ada perubahan API atau database.
- Welcome menampilkan kutipan Feynman dalam English dan interpretasi Aqsha dalam bahasa Indonesia.
- Storytelling tipis hadir pada setiap langkah tanpa mengaburkan pertanyaan.
- Interests menjelaskan bahwa Aqsha dapat menelusuri katalog sekitar 320 juta karya ilmiah tanpa menyiratkan full-text access universal.
- Finish menampilkan background dan minat pengguna dalam bentuk label yang manusiawi.
- Lebih dari tiga minat diringkas dengan “dan {n} bidang lain”.
- CTA finish dan redirect untuk pengguna completed menuju `/app`.
- UI menggunakan semantic tokens dari `globals.css` dan mendukung light/dark mode.
- Motion menghormati `prefers-reduced-motion`.
- Flow dapat diselesaikan dengan keyboard dan tetap nyaman di mobile.
- Target waktu penyelesaian tetap sekitar satu menit.
- Verification gates yang relevan lulus.

## Risiko dan Mitigasi

### Storytelling membuat flow lambat

Mitigasi: pertahankan narrative copy singkat, prioritaskan pertanyaan dalam hierarchy, dan jangan menambah state baru.

### Kutipan terasa menghakimi

Mitigasi: biarkan kutipan tampil apa adanya, lalu segera jembatani dengan interpretasi Aqsha yang suportif dan menempatkan pengguna sebagai pengambil keputusan.

### Klaim 320 juta menjadi stale atau disalahartikan

Mitigasi: gunakan “sekitar”, rujuk katalog scholarly works, hindari klaim full-text universal, dan verifikasi angka terhadap OpenAlex saat implementation copy difinalkan.

### Finish terlalu menyimpulkan identitas pengguna

Mitigasi: hanya pantulkan jawaban eksplisit, jangan menghasilkan tujuan, level keahlian, atau rekomendasi yang tidak diminta.

### Visual exploration menjadi scope creep

Mitigasi: hanya satu bahasa visual dan motion yang kohesif; tidak menambah pertanyaan, backend work, atau perubahan `/app` yang tidak diperlukan.

## Keputusan Final

- Pendekatan: **Guided Research Journey**.
- Tone: **sweet and spicy**.
- Quote: Richard Feynman, English asli dengan interpretasi Indonesia.
- Storytelling: tipis di setiap langkah.
- Data: seluruh field saat ini dipertahankan.
- Finish: personalized reflection.
- Destination: `/app`.
- Warna dan typography: semantic tokens dari `globals.css`.
- Visual form: sengaja tidak dikunci dalam design spec.
