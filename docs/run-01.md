# Laporan Riset Awal: Peluang Topik Skripsi Penerapan AI Agent / Agentic AI untuk 2026

## 1. Catatan keterbatasan bukti

Riset ini **belum cukup kuat untuk menyimpulkan prediksi pasar 2026 secara kuantitatif**, karena bukti yang tersedia didominasi oleh sumber akademik/arXiv dan hanya sedikit sumber industri yang isinya dapat diakses penuh. Sumber McKinsey yang ditemukan tidak dapat dibaca karena halaman menampilkan “Access Denied”, sehingga tidak digunakan sebagai dasar klaim substantif.[7][8][10] Beberapa sumber akademik yang tersedia juga berupa metadata atau cuplikan awal, bukan isi lengkap artikel.[2][4][5] Karena itu, laporan ini sebaiknya dibaca sebagai **peta awal ide skripsi dan rancangan riset**, bukan sebagai survei final industri 2026.

Namun, ada beberapa dasar yang cukup untuk menyusun arah skripsi: survei agent workflow menyatakan bahwa autonomous agents berbasis LLM dapat menggunakan **tools, memory, dan reasoning** untuk mencapai tujuan pengguna, dan agent workflow diposisikan sebagai kerangka orkestrasi agar perilaku AI lebih **scalable, controllable, dan secure**.[3] Sumber tentang POLARIS menekankan bahwa workflow back-office membutuhkan agentic system yang **auditable, policy-aligned, dan operationally predictable**, serta menggunakan planning berbasis DAG, validasi, repair loop, dan policy guardrails.[1] Ada juga sumber yang secara eksplisit membahas “production-grade agentic AI workflows”.[6]

---

## 2. Definisi kerja: AI Agent vs chatbot biasa

Untuk skripsi, **AI Agent** sebaiknya tidak didefinisikan hanya sebagai chatbot yang menjawab pertanyaan. Berdasarkan sumber survei agent workflow, agent berbasis LLM dapat memanfaatkan tools, memory, dan reasoning untuk menyelesaikan tujuan pengguna secara dinamis.[3] Dengan demikian, topik skripsi yang lebih “agentic” idealnya memiliki minimal tiga unsur berikut:

1. **Perencanaan multi-langkah**, karena agent workflow diposisikan sebagai orkestrasi terstruktur untuk sistem agent yang makin kompleks.[3]
2. **Pemakaian tools eksternal**, karena autonomous agents dalam survei disebut dapat menggunakan tools untuk mencapai tujuan pengguna.[3]
3. **Memory atau state**, karena sumber survei menyebut memory sebagai salah satu kemampuan yang digunakan agent.[3]
4. **Validasi atau guardrail**, karena back-office automation dalam POLARIS menekankan validasi, bounded repair loop, dan policy guardrails untuk mencegah atau mengarahkan side effects.[1]
5. **Evaluasi berbasis tugas**, karena sistem agentic yang layak diteliti perlu dibandingkan berdasarkan keberhasilan menyelesaikan workflow, bukan hanya kualitas jawaban percakapan; kebutuhan operational predictability dan validated execution didukung oleh sumber POLARIS.[1]

---

## 3. Peta bidang potensial untuk skripsi AI Agent

Tabel berikut adalah **peta kandidat**, bukan bukti bahwa semua bidang ini sudah matang secara industri. Dasarnya adalah kemampuan agent untuk menggunakan tools, memory, reasoning, workflow orchestration, dan guardrails.[1][3][6]

| Bidang                    | Proses kerja yang realistis diautomasi oleh agent                                            | Mengapa cocok untuk skripsi                                                                   | Basis bukti                                                                                                               |
| ------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Pendidikan / kampus       | Penyusunan rencana belajar personal, pembuatan kuis dari materi, pemberian feedback tugas    | Datanya bisa dibuat dari silabus, modul, dan rubrik penilaian                                 | Agent dapat memakai tools, memory, dan reasoning; workflow agent membantu orkestrasi tugas kompleks.[3]                   |
| UMKM / retail             | Pencatatan pesanan, rekomendasi balasan pelanggan, ringkasan stok dan penjualan              | Prototipe bisa dibuat dengan spreadsheet, katalog produk, dan chat simulasi                   | Agentic workflow dapat mengorkestrasi tools dan memory untuk tujuan pengguna.[3]                                          |
| Customer support          | Klasifikasi tiket, pencarian jawaban dari knowledge base, eskalasi ke manusia                | Mudah dievaluasi dengan metrik akurasi intent, resolution rate, dan waktu respons             | Agent workflow ditujukan untuk perilaku yang lebih controllable dan secure.[3]                                            |
| Back-office administrasi  | Validasi dokumen, routing permintaan, pembuatan ringkasan dan draft keputusan                | Sangat sesuai dengan kebutuhan audit, policy, dan validasi                                    | POLARIS secara eksplisit membahas agentic AI untuk back-office automation yang auditable dan policy-aligned.[1]           |
| Kesehatan administratif   | Triage administratif, ringkasan formulir, pengecekan kelengkapan dokumen pasien              | Bisa difokuskan pada administrasi, bukan diagnosis medis                                      | Agentic system di domain sensitif memerlukan guardrails, validated execution, dan policy control.[1]                      |
| Software engineering      | Pembuatan issue summary, code review awal, generate test case, debugging berbantuan tools    | Banyak dataset dan benchmark publik; mudah membuat prototipe berbasis repo kecil              | Agent dapat memakai tools dan reasoning untuk menyelesaikan tujuan pengguna.[3]                                           |
| Legal-tech / compliance   | Pencarian pasal, ringkasan kontrak, checklist kepatuhan dokumen                              | Cocok untuk RAG agent dengan sumber hukum terbatas dan evaluasi berbasis akurasi kutipan      | Back-office workflow memerlukan auditability, policy alignment, dan predictable execution.[1]                             |
| HR / rekrutmen            | Screening CV awal, pencocokan kandidat-job description, pembuatan pertanyaan wawancara       | Dapat diuji dengan dataset CV sintetis dan rubrik fairness                                    | Workflow agent perlu guardrails dan validasi agar tidak melakukan keputusan berisiko tanpa kontrol.[1]                    |
| Manufaktur / Industry 4.0 | Ringkasan laporan produksi, deteksi anomali berbasis log, instruksi maintenance berbasis SOP | Relevan dengan sumber yang membahas autonomous agents dalam distributed AI untuk Industry 4.0 | Sumber ACM/Expert Systems with Applications berjudul survei autonomous agents dalam distributed AI untuk Industry 4.0.[5] |
| Layanan publik            | Asisten formulir, pengecekan kelengkapan berkas, routing pengaduan masyarakat                | Cocok untuk prototipe dengan regulasi atau SOP terbuka                                        | Agent workflow mendukung orkestrasi proses multi-langkah dan kontrol perilaku.[3]                                         |

---

## 4. Kesenjangan riset yang bisa dijadikan kontribusi skripsi

Beberapa gap berikut lebih aman dijadikan dasar skripsi dibanding klaim “membangun agent paling canggih”, karena sumber yang tersedia menekankan kebutuhan workflow, kontrol, validasi, dan keamanan.[1][3][6]

1. **Evaluasi task completion**: banyak prototipe AI berhenti pada kualitas jawaban, padahal agent perlu dievaluasi berdasarkan keberhasilan menyelesaikan workflow multi-langkah.[1][3]
2. **Guardrail dan human-in-the-loop**: back-office automation memerlukan validasi, repair loop, dan policy guardrails sebelum tindakan berdampak dijalankan.[1]
3. **Auditability**: workflow organisasi membutuhkan agent yang bisa diaudit dan diprediksi, bukan hanya agent yang menjawab dengan lancar.[1]
4. **Integrasi tools**: agent yang relevan untuk skripsi sebaiknya mengakses tools seperti spreadsheet, database, search, email draft, kalender, atau document parser, karena sumber agent workflow menekankan penggunaan tools.[3]
5. **Memory dan personalisasi**: agent dapat menggunakan memory untuk mencapai tujuan pengguna, sehingga penelitian dapat menguji manfaat memory terhadap performa tugas.[3]
6. **Keamanan dan kontrol perilaku**: agent workflow disebut penting untuk perilaku AI yang scalable, controllable, dan secure.[3]
7. **Kesiapan produksi**: keberadaan sumber tentang “production-grade agentic AI workflows” menunjukkan bahwa desain, pengembangan, dan deployment workflow adalah isu riset/praktik yang relevan.[6]
8. **Keterbatasan bukti industri terbuka**: beberapa sumber industri yang dicari tidak dapat diakses, sehingga klaim tentang adopsi industri perlu divalidasi dengan sumber tambahan sebelum menjadi latar belakang skripsi.[7][8][10]

---

## 5. Rekomendasi 10 ide judul skripsi yang spesifik dan feasible

Skor kelayakan di bawah adalah **penilaian awal** untuk membantu memilih topik. Skor bukan hasil eksperimen. Skala: 1 rendah, 5 tinggi.

### Ringkasan prioritas

| Prioritas |                                                  Ide skripsi | Novelty | Akses data | Kompleksitas | Manfaat | Risiko etik/regulasi |
| --------- | -----------------------------------------------------------: | ------: | ---------: | -----------: | ------: | -------------------: |
| 1         |                        RAG Agent untuk customer support UMKM |       3 |          5 |            3 |       5 |                    2 |
| 2         | Agent back-office untuk validasi dokumen administrasi kampus |       4 |          4 |            4 |       5 |                    3 |
| 3         |              AI Agent pembuat kuis dan feedback pembelajaran |       3 |          5 |            3 |       4 |                    2 |
| 4         |                   Agent code review dan test-case generation |       4 |          4 |            4 |       4 |                    2 |
| 5         |           Legal RAG Agent untuk ringkasan peraturan terbatas |       4 |          3 |            4 |       4 |                    4 |
| 6         |                 HR screening agent dengan fairness guardrail |       4 |          3 |            4 |       4 |                    5 |
| 7         |                               Agent pengaduan layanan publik |       3 |          4 |            3 |       4 |                    3 |
| 8         |                           Agent analisis stok dan order UMKM |       3 |          5 |            3 |       5 |                    2 |
| 9         |                  Agent administrasi kesehatan non-diagnostik |       4 |          2 |            4 |       4 |                    5 |
| 10        |                           Agent SOP maintenance Industry 4.0 |       4 |          3 |            4 |       4 |                    3 |

---

## 6. Detail ide skripsi

### 1. RAG Agent untuk customer support UMKM

**Contoh judul:**  
“Pengembangan RAG-Based AI Agent untuk Otomasi Customer Support UMKM dengan Evaluasi Task Completion dan Human Escalation”

**Masalah:** UMKM sering memiliki pertanyaan pelanggan berulang, seperti harga, stok, ongkir, retur, dan status pesanan. Topik ini cocok sebagai agent karena workflow dapat melibatkan pencarian knowledge base, pengambilan data pesanan, penyusunan jawaban, dan eskalasi ke manusia; pola ini sejalan dengan konsep agent yang memakai tools, memory, dan reasoning.[3]

**Bentuk agent:** single-agent dengan RAG, memory percakapan, tool spreadsheet/catalog API, dan rule-based escalation. Agent seperti ini masih sesuai dengan konsep workflow agent karena menggunakan tools dan reasoning untuk tujuan pengguna.[3]

**Data/tools:** FAQ UMKM, katalog produk, data pesanan sintetis, spreadsheet, vector database, dan LLM API lokal/cloud.

**Evaluasi:** task completion rate, akurasi jawaban berbasis ground truth, hallucination rate, escalation accuracy, response time, dan skor kepuasan pengguna.

**Risiko:** jawaban salah tentang harga, stok, atau kebijakan retur dapat merugikan pelanggan; mitigasinya adalah guardrail dan validasi sebelum jawaban final, sejalan dengan kebutuhan validated execution dan policy guardrails pada workflow agentic.[1]

**Kontribusi:** membandingkan chatbot RAG biasa dengan RAG agent yang memiliki tools, memory, dan eskalasi.

---

### 2. Agent back-office untuk validasi dokumen administrasi kampus

**Contoh judul:**  
“Desain Governed AI Agent untuk Validasi Kelengkapan Dokumen Administrasi Kampus Berbasis Policy Guardrails”

**Masalah:** Proses administrasi kampus biasanya memiliki checklist, aturan, dokumen, dan alur persetujuan; ini cocok untuk agentic workflow karena back-office automation membutuhkan sistem yang auditable, policy-aligned, dan operationally predictable.[1]

**Bentuk agent:** planner-agent yang memecah tugas menjadi checklist, document parser, validator, dan decision router. Desain seperti ini sejalan dengan POLARIS yang memperlakukan automation sebagai typed plan synthesis dan validated execution.[1]

**Data/tools:** SOP administrasi, template formulir, dokumen PDF sintetis, OCR/document parser, database status pengajuan.

**Evaluasi:** precision/recall deteksi dokumen kurang, compliance rate terhadap SOP, audit log completeness, waktu proses, dan jumlah intervensi manusia.

**Risiko:** keputusan administratif otomatis bisa salah; mitigasinya adalah human approval untuk keputusan final dan policy guardrails untuk tindakan berdampak.[1]

**Kontribusi:** model evaluasi agent back-office yang mengukur auditability, compliance, dan task completion.

---

### 3. AI Agent pembuat kuis dan feedback pembelajaran

**Contoh judul:**  
“AI Learning Agent Berbasis Memory dan Rubric untuk Pembuatan Kuis Adaptif dan Feedback Tugas Mahasiswa”

**Masalah:** Pembelajaran personal membutuhkan agent yang mengingat progres mahasiswa, memilih materi, membuat kuis, dan memberi feedback. Kemampuan ini cocok dengan konsep agent yang memakai memory, tools, dan reasoning.[3]

**Bentuk agent:** learning planner agent, quiz generator, feedback evaluator, dan memory profile mahasiswa.

**Data/tools:** modul kuliah, silabus, bank soal, rubrik penilaian, jawaban mahasiswa sintetis.

**Evaluasi:** kesesuaian soal dengan learning outcome, kualitas feedback berdasarkan rubrik, peningkatan skor pre-test/post-test, dan usability.

**Risiko:** feedback salah dapat menyesatkan mahasiswa; mitigasinya adalah rubrik eksplisit dan validasi dosen.

**Kontribusi:** menguji apakah memory mahasiswa meningkatkan relevansi kuis dan feedback dibanding baseline tanpa memory.

---

### 4. Agent code review dan test-case generation

**Contoh judul:**  
“Evaluasi AI Agent untuk Code Review Awal dan Generasi Test Case pada Repository Skala Kecil”

**Masalah:** Tugas software engineering melibatkan pemahaman issue, membaca file, menjalankan test, dan memberi saran perbaikan; bentuk ini cocok dengan agent karena agent dapat menggunakan tools dan reasoning untuk menyelesaikan tujuan pengguna.[3]

**Bentuk agent:** coding agent dengan tool akses file, static analyzer, test runner, dan issue summarizer.

**Data/tools:** repository open-source kecil, bug sintetis, unit test, GitHub issue sample.

**Evaluasi:** bug detection rate, test coverage improvement, valid patch suggestion rate, false positive rate, dan waktu penyelesaian.

**Risiko:** agent bisa menyarankan patch yang merusak fungsi; mitigasinya adalah sandbox execution dan test gating.

**Kontribusi:** membandingkan performa LLM tanpa tools dengan agent yang memakai file search dan test runner.

---

### 5. Legal RAG Agent untuk ringkasan peraturan terbatas

**Contoh judul:**  
“Pengembangan Legal RAG Agent dengan Citation Verification untuk Ringkasan Peraturan Akademik atau Ketenagakerjaan”

**Masalah:** Pengguna sering membutuhkan ringkasan peraturan yang dapat ditelusuri ke sumber. Topik ini cocok dengan pendekatan agent karena dapat menggabungkan retrieval, reasoning, citation checking, dan abstention ketika bukti tidak cukup; kebutuhan kontrol dan auditability sejalan dengan prinsip workflow yang controllable dan secure.[3]

**Bentuk agent:** RAG agent dengan citation verifier, contradiction checker, dan answer abstention.

**Data/tools:** dokumen peraturan kampus, peraturan internal organisasi, atau regulasi publik terbatas.

**Evaluasi:** citation accuracy, faithfulness, answer completeness, abstention accuracy, dan human legal-review score.

**Risiko:** kesalahan interpretasi hukum; mitigasinya adalah pembatasan domain, disclaimer, dan human review.

**Kontribusi:** framework evaluasi citation-grounded legal agent untuk domain kecil.

---

### 6. HR screening agent dengan fairness guardrail

**Contoh judul:**  
“AI Agent untuk Screening CV Berbasis Job Description dengan Evaluasi Fairness dan Human-in-the-Loop”

**Masalah:** Screening kandidat melibatkan pencocokan CV dengan job description, ekstraksi skill, pemberian skor, dan rekomendasi wawancara; karena keputusan HR berdampak pada manusia, agent perlu auditability dan policy alignment seperti ditekankan pada workflow back-office.[1]

**Bentuk agent:** extractor agent, ranking agent, bias checker, dan human approval step.

**Data/tools:** CV sintetis, job description, skill taxonomy, rubric scoring.

**Evaluasi:** ranking agreement dengan reviewer manusia, fairness metric antar kelompok sintetis, explainability score, dan false rejection rate.

**Risiko:** diskriminasi dan bias; mitigasinya adalah fairness guardrail, audit log, dan larangan keputusan final otomatis.

**Kontribusi:** menguji dampak guardrail fairness terhadap kualitas rekomendasi screening.

---

### 7. Agent pengaduan layanan publik

**Contoh judul:**  
“AI Agent untuk Klasifikasi, Ringkasan, dan Routing Pengaduan Masyarakat Berbasis SOP Layanan Publik”

**Masalah:** Pengaduan layanan publik dapat melibatkan klasifikasi kategori, ringkasan masalah, pencarian SOP, dan routing ke unit terkait. Workflow multi-langkah ini sesuai dengan agent workflow sebagai orkestrasi sistem agent yang lebih controllable.[3]

**Bentuk agent:** classifier agent, summarizer, SOP retriever, routing agent, dan escalation module.

**Data/tools:** dataset pengaduan sintetis, SOP layanan, kategori instansi, dashboard sederhana.

**Evaluasi:** classification accuracy, routing accuracy, summary quality, response time, dan human override rate.

**Risiko:** salah routing dapat memperlambat layanan; mitigasinya adalah confidence threshold dan human escalation.

**Kontribusi:** prototipe agent layanan publik dengan evaluasi task routing.

---

### 8. Agent analisis stok dan order UMKM

**Contoh judul:**  
“AI Agent Berbasis Spreadsheet untuk Monitoring Stok, Prediksi Restock Sederhana, dan Draft Pesanan Supplier pada UMKM”

**Masalah:** Banyak workflow UMKM berbasis spreadsheet dapat dipecah menjadi baca data, deteksi stok rendah, hitung kebutuhan, dan membuat draft pesanan. Topik ini sesuai dengan konsep agent yang menggunakan tools dan reasoning.[3]

**Bentuk agent:** spreadsheet tool agent, rule-based inventory planner, draft generator.

**Data/tools:** data stok sintetis, histori penjualan, spreadsheet, dashboard web sederhana.

**Evaluasi:** akurasi deteksi stok rendah, error perhitungan restock, waktu proses, dan usability.

**Risiko:** rekomendasi stok berlebihan atau kurang; mitigasinya adalah batasan minimum-maksimum dan approval manual.

**Kontribusi:** menunjukkan perbedaan automation berbasis rule saja dengan agent yang dapat menjelaskan keputusan restock.

---

### 9. Agent administrasi kesehatan non-diagnostik

**Contoh judul:**  
“Governed AI Agent untuk Triage Administratif dan Pengecekan Kelengkapan Formulir Pasien Non-Diagnostik”

**Masalah:** Domain kesehatan sensitif sehingga topik skripsi sebaiknya dibatasi pada administrasi, bukan diagnosis. Pendekatan agentic di domain sensitif membutuhkan guardrails, validasi, dan kontrol tindakan seperti yang ditekankan pada sumber back-office automation.[1]

**Bentuk agent:** form checker, appointment router, document completeness validator, dan human approval step.

**Data/tools:** formulir sintetis, SOP pendaftaran, jadwal dokter sintetis, database dummy.

**Evaluasi:** completeness detection accuracy, routing accuracy, safety violation count, audit log completeness.

**Risiko:** privasi dan kesalahan administratif; mitigasinya adalah data sintetis, anonymization, dan human-in-the-loop.

**Kontribusi:** rancangan evaluasi safety untuk agent administratif di domain sensitif.

---

### 10. Agent SOP maintenance Industry 4.0

**Contoh judul:**  
“RAG Agent untuk Bantuan Maintenance Berbasis SOP dan Log Mesin pada Skenario Industry 4.0”

**Masalah:** Sumber yang tersedia menunjukkan adanya survei autonomous agents dalam distributed AI untuk Industry 4.0, sehingga domain manufaktur dapat dijadikan kandidat riset awal.[5] Proses maintenance dapat dirancang sebagai workflow pencarian SOP, interpretasi log, rekomendasi langkah, dan eskalasi teknisi.

**Bentuk agent:** SOP retriever, log summarizer, anomaly explanation agent, dan escalation recommender.

**Data/tools:** SOP mesin sintetis, log sensor dummy, knowledge base troubleshooting.

**Evaluasi:** SOP retrieval accuracy, correctness of recommended steps, false alarm rate, dan technician review score.

**Risiko:** rekomendasi maintenance salah dapat berisiko operasional; mitigasinya adalah hanya memberi rekomendasi non-eksekusi dan wajib approval teknisi.

**Kontribusi:** simulasi agent maintenance yang menekankan traceability ke SOP.

---

## 7. Topik paling disarankan untuk mahasiswa skripsi

Jika tujuanmu adalah skripsi yang **feasible, terukur, dan tidak terlalu berisiko**, tiga topik paling aman adalah:

1. **RAG Agent untuk customer support UMKM**, karena data dapat dibuat sendiri, workflow jelas, dan evaluasi mudah. Dasar agentic-nya adalah tools, memory, reasoning, dan retrieval.[3]
2. **Agent validasi dokumen administrasi kampus**, karena sangat cocok dengan konsep back-office automation yang auditable, policy-aligned, dan validated.[1]
3. **AI learning agent untuk kuis dan feedback**, karena domain pendidikan relatif mudah dibuat prototipe dan dapat dievaluasi dengan rubrik.

Jika ingin topik yang lebih kuat secara akademik tetapi lebih sulit, pilih:

4. **Legal RAG Agent dengan citation verification**, karena kontribusinya bisa pada faithfulness, citation accuracy, dan abstention.
5. **HR screening agent dengan fairness guardrail**, karena kontribusinya bisa pada fairness, auditability, dan human-in-the-loop, tetapi risiko etiknya lebih tinggi.[1]

---

## 8. Rancangan metodologi umum untuk proposal

Metode berikut dapat digunakan untuk hampir semua ide di atas.

### 8.1 Desain sistem

Sistem minimal sebaiknya memiliki:

- **Planner** untuk memecah tujuan menjadi langkah-langkah, karena workflow agentic membutuhkan orkestrasi proses.[3]
- **Tool layer** untuk mengakses spreadsheet, dokumen, database, atau search, karena agent dalam survei disebut memanfaatkan tools.[3]
- **Memory/state** untuk menyimpan konteks tugas atau preferensi pengguna, karena memory disebut sebagai kemampuan agent.[3]
- **Validator/guardrail** untuk memeriksa output sebelum tindakan berdampak, karena POLARIS menekankan validated execution dan policy guardrails.[1]
- **Audit log** untuk merekam langkah agent, karena back-office workflow membutuhkan auditability dan operational predictability.[1]

### 8.2 Baseline pembanding

Gunakan minimal dua baseline:

1. **Chatbot LLM biasa tanpa tools**.
2. **RAG chatbot tanpa planning dan validator**.
3. **Agent penuh dengan planning, tools, memory, dan validator**.

Perbandingan ini relevan karena agentic workflow dibedakan oleh kemampuan tools, memory, reasoning, dan orkestrasi.[3]

### 8.3 Metrik evaluasi

Gunakan kombinasi metrik berikut:

| Metrik                      | Definisi singkat                               | Cocok untuk                                |
| --------------------------- | ---------------------------------------------- | ------------------------------------------ |
| Task completion rate        | Persentase tugas yang selesai benar            | Semua agent workflow                       |
| Tool-use accuracy           | Ketepatan memilih dan memakai tool             | Agent dengan spreadsheet, database, search |
| Faithfulness / groundedness | Kesesuaian jawaban dengan sumber               | RAG, legal, customer support               |
| Policy compliance rate      | Kepatuhan terhadap SOP atau aturan             | Back-office, HR, legal, layanan publik     |
| Human override rate         | Seberapa sering manusia perlu mengoreksi       | Domain berisiko                            |
| Latency                     | Waktu penyelesaian tugas                       | Customer support, layanan publik           |
| Cost per task               | Estimasi biaya API atau komputasi              | Semua prototipe                            |
| Safety violation count      | Jumlah tindakan/keluaran yang melanggar aturan | HR, legal, kesehatan, back-office          |

Metrik compliance, guardrail, dan auditability penting terutama untuk workflow organisasi karena sumber POLARIS menekankan auditability, policy alignment, validated execution, dan guardrails.[1]

---

## 9. Template rumusan masalah

Kamu bisa memakai pola berikut:

> “Bagaimana merancang dan mengevaluasi AI Agent berbasis LLM yang mampu menyelesaikan workflow [domain] secara multi-langkah dengan memanfaatkan retrieval, tools, memory, dan guardrail, serta bagaimana performanya dibandingkan chatbot/RAG biasa berdasarkan task completion, akurasi, waktu, dan compliance?”

Rumusan tersebut sesuai dengan karakter agent yang menggunakan tools, memory, dan reasoning.[3] Rumusan tersebut juga sesuai dengan kebutuhan workflow yang lebih terkontrol, aman, dan dapat divalidasi.[1][3]

---

## 10. Kesimpulan

Bidang paling feasible untuk skripsi AI Agent pada konteks 2026 adalah **customer support UMKM, administrasi kampus/back-office, pendidikan, software engineering, legal-tech terbatas, HR, layanan publik, kesehatan administratif, dan Industry 4.0 simulatif**. Rekomendasi ini merupakan peta kandidat berbasis kemampuan agent untuk tools, memory, reasoning, workflow orchestration, dan guardrails, bukan klaim bahwa semua bidang tersebut sudah matang secara industri.[1][3][5][6]

Untuk skripsi yang aman dan cepat dieksekusi, pilih topik dengan **data mudah dibuat, risiko rendah, dan evaluasi jelas**, seperti customer support UMKM, validasi dokumen kampus, atau learning agent. Untuk skripsi yang lebih akademik, pilih topik dengan **guardrail, auditability, fairness, atau citation verification**, karena sumber yang tersedia menekankan pentingnya validated execution, policy guardrails, controllability, dan security dalam agentic workflow.[1][3]

**Rekomendasi final:** jika kamu belum punya domain khusus, mulai dari judul:  
**“Pengembangan RAG-Based AI Agent untuk Otomasi Customer Support UMKM dengan Evaluasi Task Completion, Groundedness, dan Human Escalation.”**  
Topik ini relatif mudah diprototipe, datanya dapat dibuat sendiri, metriknya jelas, dan tetap memenuhi karakter agentic karena melibatkan retrieval, tools, memory, reasoning, dan eskalasi.

## Audit Notes

The following claims were not fully supported by accepted evidence and should be treated as caveated:

- Laporan Riset Awal: Peluang Topik Skripsi Penerapan AI Agent / Agentic AI untuk 2026
- Catatan keterbatasan bukti
- Riset ini **belum cukup kuat untuk menyimpulkan prediksi pasar 2026 secara kuantitatif**, karena bukti yang tersedia didominasi oleh sumber akademik/arXiv dan hanya sedikit sumber industri yang isinya dapat diakses penuh.
- Definisi kerja: AI Agent vs chatbot biasa
- Untuk skripsi, **AI Agent** sebaiknya tidak didefinisikan hanya sebagai chatbot yang menjawab pertanyaan.
- Peta bidang potensial untuk skripsi AI Agent
