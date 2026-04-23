# AI Agent Requirements

## Tujuan Dokumen

Fokus dokumen ini adalah:

- mendefinisikan agent yang dibutuhkan
- menjelaskan tanggung jawab masing-masing agent
- merinci kebutuhan fungsional sistem
- menetapkan batas kualitas, trust, observability, dan operasional

## Ringkasan Arsitektur

Sistem AI agent memiliki dua jalur utama:

- `General mode` untuk percakapan cepat, ideation, dan bantuan umum
- `Research mode` untuk jawaban mendalam berbasis evidence yang dapat ditelusuri dan diaudit

Arsitektur sistem dipisahkan menjadi tiga lapisan tanggung jawab:

- `Control plane`: pengelolaan mode, alur workflow, status run, kepemilikan thread, dan trace
- `Reasoning plane`: agent-agent yang melakukan planning, screening, kritik, dan sintesis
- `Evidence plane`: retrieval, evaluasi evidence, audit citation, dan persistence hasil research

Prinsip utamanya adalah memisahkan reasoning dari eksekusi deterministik agar sistem tetap cepat pada jalur general, tetapi tetap dapat dipercaya pada jalur research.

## Definisi Agent

### 1. Supervisor Agent

Peran:

- Menangani percakapan umum pada general mode
- Menjaga alur respons tetap natural dan cepat
- Mengorkestrasi penggunaan sumber internal bila memang diperlukan

Kebutuhan:

- Mampu membaca konteks percakapan dan konteks thread
- Mampu menggunakan referensi atau mention dari user sebagai petunjuk tambahan
- Mampu memilih kapan perlu memanggil sumber atau evidence internal

Output:

- Respons natural langsung ke user

### 2. Planner Agent

Peran:

- Menyusun rencana kerja research sebelum proses riset dijalankan
- Menentukan apakah intent user sudah cukup jelas atau masih perlu klarifikasi

Kebutuhan:

- Harus menghasilkan output yang terstruktur
- Harus bisa mengembalikan status `needs_clarification` bila scope belum cukup jelas
- Harus bisa mengembalikan `draft_plan` bila plan sudah dapat diajukan
- Harus mendukung approval gate sebelum workflow dilanjutkan

Output:

- Pertanyaan klarifikasi atau draft plan

### 3. External Source Screener Agent

Peran:

- Menilai kandidat sumber eksternal hasil discovery
- Menyaring kandidat menjadi shortlist dan reject

Kebutuhan:

- Harus memprioritaskan sumber yang kredibel dan relevan
- Harus konservatif dalam shortlisting
- Harus bisa menghindari duplikasi sumber
- Harus memberi alasan untuk keputusan shortlist dan reject
- Harus bekerja dengan output contract yang ketat

Output:

- `shortlisted[]`
- `rejected[]`
- indikasi kualitas evidence per kandidat

### 4. Critic / Claim Extraction Agent

Peran:

- Mengubah evidence yang tersedia menjadi claim-claim yang eksplisit
- Menilai apakah claim yang dihasilkan benar-benar didukung evidence
- Mengidentifikasi bagian yang masih lemah atau belum terdukung

Kebutuhan:

- Harus menghasilkan claim yang atomik dan dapat ditelusuri
- Harus menghubungkan setiap claim ke evidence yang relevan
- Tidak boleh mengarang evidence atau referensi
- Harus bisa menghasilkan daftar concern bila evidence belum memadai

Output:

- daftar claim
- confidence per claim
- relasi claim-evidence
- unsupported concerns

### 5. Synthesis Agent

Peran:

- Menyusun jawaban akhir berdasarkan claim yang sudah divalidasi
- Menyiapkan jawaban yang siap masuk ke proses audit sitasi

Kebutuhan:

- Hanya boleh menggunakan claim yang diberikan
- Harus menyisipkan marker referensi internal untuk mendukung audit
- Harus menulis jawaban akhir yang utuh dan koheren

Output:

- jawaban akhir dengan marker claim internal

### 6. Editor Assistant Agent

Peran:

- Memberikan bantuan penulisan singkat di jalur terpisah dari chat utama
- Mendukung workflow drafting dan continuation

Kebutuhan:

- Respons harus singkat dan cepat
- Tidak ikut ke pipeline research
- Fokus pada assistance penulisan, bukan evidence audit

Output:

- lanjutan teks atau bantuan drafting singkat

## Subagent Fungsional

### 1. Internal Retrieval

Peran:

- Mengambil paper, dokumen, dan evidence dari basis pengetahuan internal

Kebutuhan:

- Mampu mencari kandidat sumber
- Mampu mengambil evidence pada level potongan konten
- Mampu menilai apakah evidence yang tersedia sudah cukup
- Harus mengembalikan evidence pool yang siap dipakai oleh agent reasoning

Output:

- ringkasan sumber internal
- evidence pool internal
- status kecukupan evidence

### 2. External Evidence Ingest

Peran:

- Mengubah hasil discovery sumber eksternal menjadi evidence yang dapat dipakai workflow research

Kebutuhan:

- Mampu mengambil dan menormalisasi isi sumber eksternal
- Mampu membentuk evidence item yang terikat pada sesi research
- Harus tetap fail-soft bila ekstraksi sumber gagal atau parsial

Output:

- evidence snippets dari sumber eksternal

### 3. Citation Audit

Peran:

- Memvalidasi marker referensi dalam jawaban akhir
- Memastikan claim yang dirujuk memang memiliki evidence pendukung
- Mengubah marker internal menjadi citation final yang konsisten

Kebutuhan:

- Harus deterministik
- Harus berbasis aturan validasi yang eksplisit
- Harus dapat menghasilkan status akhir yang mudah ditafsirkan

Output:

- `completed`, `warned`, atau `failed`
- cleaned answer
- daftar citation final

## Requirement Fungsional Sistem

### Routing dan Mode

- Sistem harus memiliki dua mode: `general` dan `research`
- Setiap request harus diarahkan ke jalur eksekusi sesuai mode
- Satu entry point diperbolehkan selama branching antar mode jelas

### General Mode

- Sistem harus dapat menghasilkan respons cepat untuk percakapan umum
- Sistem boleh menggunakan sumber internal bila relevan
- Sistem tidak wajib melakukan citation audit penuh pada mode ini
- Sistem harus tetap menjaga konteks thread dan kepemilikan user

### Research Mode

- Sistem harus berjalan melalui workflow bertahap
- Workflow harus dapat di-suspend dan di-resume
- Workflow harus berhenti jika diperlukan klarifikasi user
- Workflow harus berhenti sebelum eksekusi penuh bila plan belum disetujui
- Eksekusi penuh hanya boleh berjalan setelah plan disetujui user

### Human-in-the-Loop

- Sistem harus mendukung loop klarifikasi
- Sistem harus mendukung aksi user: approve, revise, dan clarify
- Sistem harus dapat melanjutkan run yang sempat dihentikan karena menunggu user

### Gating Logic

- Sistem harus memiliki sufficiency gate untuk menilai kecukupan evidence internal
- Jika evidence internal belum cukup, sistem harus dapat berpindah ke discovery eksternal
- Jika evidence kosong total, sistem harus masuk ke jalur no-evidence

### No-Evidence Path

- Jika tidak ada evidence yang cukup, sistem tidak boleh memaksakan jawaban penuh
- Sistem harus memberi jawaban jujur singkat
- Sistem tidak boleh menampilkan marker citation palsu
- Status run harus ditandai sebagai `warned`

### Trace dan Final Output

- Sistem harus mengirim trace per step ke antarmuka pengguna
- Sistem harus bisa menunjukkan state planning, retrieval, screening, claims, synthesis, audit, dan warning
- Jawaban akhir dan trace harus konsisten satu sama lain

## Kontrak Output per Jalur

### Output General Mode

- berupa respons natural langsung
- boleh dibantu evidence internal
- tidak wajib melalui citation audit deterministik

### Output Research Mode

Research mode harus melalui urutan tahap berikut:

1. planning
2. clarify atau approve gate
3. retrieval
4. external screening bila diperlukan
5. claim extraction
6. synthesis
7. citation audit
8. finalize

Status akhir research mode harus salah satu dari:

- `completed`
- `warned`
- `failed`

## Requirement Trust dan Kualitas

### Anti-Hallucination

- Setiap claim harus terkait ke evidence
- Synthesizer tidak boleh menciptakan sumber baru
- Jika evidence tidak cukup, sistem harus menyampaikan keterbatasan secara eksplisit
- Audit akhir harus memverifikasi konsistensi antara isi jawaban dan citation

### Separation of Concern

- Agent reasoning harus dipisahkan dari subagent fungsional
- Workflow orchestration harus dipisahkan dari generasi jawaban
- Audit evidence harus dipisahkan dari proses sintesis

### Explainability

- Setiap langkah penting harus dapat ditelusuri
- Alasan status `completed`, `warned`, atau `failed` harus dapat dijelaskan
- Keputusan penting dalam research mode harus memiliki trace yang cukup untuk dibaca operator

## Requirement Data dan Memori

- Sistem harus memiliki memori berbasis thread
- Sistem harus menyimpan sesi research secara terpisah dari percakapan umum
- Sistem harus menyimpan claim, relasi claim-evidence, citation, dan workflow event
- Sistem harus menyimpan status run aktif dan metadata terakhir untuk kebutuhan resume dan observability

## Requirement Keamanan

- Thread hanya boleh diakses oleh pemilik yang sah
- Setiap workflow run harus terikat ke konteks user yang benar
- Akses tidak sah harus langsung ditolak
- Trace dan state research tidak boleh bocor antar user

## Requirement Observability dan Operasional

### Observability

- Setiap step harus tercatat sebagai event
- Sistem harus menyediakan audit trail untuk debugging dan analytics
- User dan operator harus dapat melihat progres research dengan transparan

### Reliability

- Dependency eksternal harus memiliki timeout policy
- Dependency eksternal harus memiliki retry policy yang terukur
- Pipeline harus fail-soft bila sebagian sumber gagal
- Kegagalan satu sumber tidak boleh langsung menggagalkan keseluruhan run bila evidence lain masih tersedia

### KPI yang Perlu Dimonitor

- `Coverage`: persentase run yang memiliki evidence pool
- `Grounding`: distribusi status `completed`, `warned`, `failed`, dan kepadatan citation
- `Latency`: durasi per tahap penting
- `Cost`: konsumsi resource per mode

## Requirement Minimal per Agent

### Semua agent reasoning wajib memiliki

- tujuan tunggal yang jelas
- input contract yang eksplisit
- output contract yang terdefinisi
- batas tanggung jawab yang tegas
- failure behavior yang jelas
- kemampuan integrasi dengan orchestrator
- kemampuan ditrace per step

### Semua subagent fungsional wajib memiliki

- perilaku yang sedeterministik mungkin
- output yang dapat divalidasi
- fail-soft behavior
- status eksekusi yang dapat diobservasi

## Kesimpulan

Sistem AI agent yang dibutuhkan bukan hanya sistem yang mampu menjawab pertanyaan, tetapi sistem yang:

- mampu membedakan jalur cepat dan jalur evidence-grounded
- mampu meminta klarifikasi sebelum research dimulai
- mampu meminta persetujuan user sebelum menjalankan proses yang lebih mahal
- mampu memisahkan planning, screening, kritik, sintesis, dan audit
- mampu menolak berspekulasi saat evidence tidak memadai
- mampu menyediakan trace yang jelas untuk user dan operator

Dokumen ini dapat dijadikan dasar untuk penurunan spesifikasi lebih detail per agent, workflow, dan acceptance criteria.
