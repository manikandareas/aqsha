# Artefak Riset Sementara — Peluang Skripsi AI Agent / Agentic AI 2026

> **Status bukti: belum memenuhi target Deep Research penuh.**  
> Evidence yang terbaca baru **8 sumber**, tetapi cakupan domain dan sumber industri masih belum cukup kuat untuk membuat kesimpulan final. Beberapa bidang seperti pendidikan, software engineering, customer service, HR, hukum, dan administrasi publik masih kurang bukti spesifik. Karena itu, dokumen ini adalah **peta awal berbasis sumber**, bukan rekomendasi akhir.  
> **Saran:** lakukan **retry / expanded search** untuk menambah sumber domain-spesifik sebelum memilih topik skripsi secara final.

---

## 1. Ringkasan awal

AI Agent / Agentic AI layak dijadikan tema skripsi 2026 karena tren riset dan implementasinya bergerak dari sekadar chatbot menuju sistem yang dapat:

- merencanakan langkah,
- memakai tool/API,
- mengambil data eksternal,
- menjalankan workflow multi-step,
- melakukan refleksi/evaluasi,
- dan bekerja dengan tingkat otonomi tertentu.

Sumber survei tentang **agentic search** menjelaskan bahwa LLM biasa masih punya keterbatasan seperti pengetahuan statis, hallucination, dan kesulitan mengambil informasi real-time/domain-specific; agentic search mencoba mengatasi ini dengan kemampuan plan–retrieve–reflect secara multi-step [1]. Survei Agentic AI yang lebih luas juga membedakan sistem agentic berbasis symbolic/classical planning dan neural/generative orchestration [5]. MIT AI Agent Index 2025 menunjukkan bahwa sistem agentic sudah cukup banyak dideploy, tetapi aspek evaluasi, safety, dan transparansi masih belum konsisten [4].

**Implikasi untuk skripsi:** topik yang paling realistis bukan “membuat agent super otonom”, tetapi membuat **agent terbatas untuk workflow spesifik**, dengan evaluasi yang jelas: akurasi, waktu penyelesaian, biaya, error rate, human approval, dan safety.

---

## 2. Definisi kerja: apa itu AI Agent?

Untuk kebutuhan skripsi, AI Agent bisa didefinisikan sebagai:

> Sistem AI yang tidak hanya menjawab pertanyaan, tetapi dapat memahami tujuan, merencanakan langkah, menggunakan tool/API/data eksternal, menjalankan aksi multi-step, dan mengevaluasi hasil dengan atau tanpa intervensi manusia.

Elemen penting:

| Elemen                | Penjelasan                                                                         |
| --------------------- | ---------------------------------------------------------------------------------- |
| Goal/task             | Agent diberi tujuan, bukan hanya prompt satu kali.                                 |
| Planning              | Agent memecah tugas menjadi beberapa langkah.                                      |
| Tool use              | Agent memakai API, database, search engine, file, spreadsheet, atau aplikasi lain. |
| Memory/context        | Agent menyimpan konteks atau riwayat tugas.                                        |
| Reflection/evaluation | Agent mengecek apakah hasilnya sudah benar.                                        |
| Human-in-the-loop     | Untuk domain berisiko, manusia tetap memberi persetujuan.                          |

Sumber tentang agentic search menekankan plan, retrieve, dan reflect dalam interaksi multi-step [1]. Sumber robotik menampilkan agent sebagai orchestrator yang menghubungkan persepsi, tool, skillset, dan aksi robot [2]. Sumber keuangan juga membedakan workflow yang predefined dengan agent yang lebih otonom dalam menjalankan aksi [8].

---

## 3. Bedanya AI Agent dengan RPA, chatbot, dan recommender system

| Sistem                     | Ciri utama                                     | Keterbatasan                                       | Bedanya dengan AI Agent                                                                                         |
| -------------------------- | ---------------------------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **RPA / automation biasa** | Mengikuti aturan tetap, klik/isi form otomatis | Rapuh jika workflow berubah                        | Agent lebih adaptif, bisa membaca konteks dan memilih langkah.                                                  |
| **Chatbot biasa**          | Menjawab pertanyaan berbasis percakapan        | Umumnya pasif, tidak menjalankan aksi kompleks     | Agent dapat memakai tool, mengambil data, dan menyelesaikan tugas multi-step.                                   |
| **RAG biasa**              | Mengambil dokumen lalu menjawab                | Sering single-turn dan heuristic                   | Agentic RAG/search dapat plan–retrieve–reflect secara iteratif [1].                                             |
| **Recommender system**     | Memberi rekomendasi item/konten                | Fokus pada prediksi preferensi                     | Agent bisa melakukan workflow setelah rekomendasi, misalnya membuat jadwal, mengisi form, atau membuat laporan. |
| **AI Agent**               | Goal-driven, multi-step, tool-using            | Risiko hallucination, keamanan, biaya, reliability | Cocok untuk skripsi jika domain dibatasi dan evaluasinya jelas.                                                 |

---

## 4. Kriteria bidang yang cocok untuk AI Agent

Bidang atau workflow cocok dijadikan topik Agentic AI jika memiliki beberapa karakteristik berikut:

1. **Multi-step workflow**  
   Contoh: ambil data → analisis → buat ringkasan → validasi → kirim rekomendasi.

2. **Butuh tool/API/data eksternal**  
   Agent bukan hanya menjawab, tetapi memakai database, dokumen, search, spreadsheet, atau sistem internal.

3. **Ada keputusan berbasis aturan + konteks**  
   Misalnya screening dokumen, prioritas tiket, deteksi anomali, atau routing permintaan.

4. **Output bisa dievaluasi**  
   Cocok untuk skripsi jika ada metrik seperti akurasi, precision/recall, task success rate, waktu, biaya API, atau tingkat kepuasan pengguna.

5. **Risiko dapat dikendalikan**  
   Untuk domain sensitif seperti kesehatan, keuangan, hukum, dan publik, agent sebaiknya memberi rekomendasi, bukan mengambil keputusan final.

6. **Bisa dibuat prototype kecil**  
   Skripsi sebaiknya memilih workflow sempit, misalnya “agent untuk menjawab pertanyaan akademik berbasis dokumen kampus”, bukan “agent untuk mengelola seluruh kampus”.

---

## 5. Peta bidang potensial — sementara

> Catatan: tabel ini **belum final**. Beberapa bidang punya dukungan sumber langsung, sementara beberapa masih berupa peluang yang perlu tambahan sumber.

| Bidang                                                   | Contoh workflow agentic                                                                         |                                        Potensi skripsi | Status bukti saat ini                                 |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | -----------------------------------------------------: | ----------------------------------------------------- |
| **1. Information retrieval / RAG / knowledge assistant** | Agent mencari dokumen, memilih sumber, meringkas, lalu memverifikasi jawaban                    |                                          Sangat tinggi | Cukup kuat dari agentic search [1]                    |
| **2. Keuangan / investasi**                              | Agent menganalisis laporan, earnings call, berita, dan membuat insight awal                     |                      Tinggi, tapi perlu kontrol risiko | Cukup kuat dari CFA Institute dan survei [8][5]       |
| **3. Robotik / embodied AI**                             | Agent mengubah instruksi natural language menjadi task list dan aksi robot                      | Tinggi untuk lab robotik, kompleks untuk skripsi biasa | Cukup kuat [2][5]                                     |
| **4. Kesehatan**                                         | Agent membantu triage administratif, summarization rekam medis, atau pencarian literatur klinis |                Tinggi, tetapi risiko dan privasi besar | Ada dukungan umum, belum cukup domain-spesifik [5][7] |
| **5. Administrasi organisasi/kampus/publik**             | Agent membantu menjawab SOP, mengecek kelengkapan dokumen, membuat draft surat                  |                   Tinggi dan realistis untuk Indonesia | Ada dukungan umum, perlu sumber tambahan [3][7]       |
| **6. Software engineering**                              | Agent membantu issue triage, code review awal, test generation, dokumentasi                     |                Tinggi, sangat cocok untuk mahasiswa TI | Belum cukup sumber spesifik dalam evidence ini        |
| **7. Customer service**                                  | Agent mengklasifikasi tiket, mencari jawaban di knowledge base, membuat draft respon            |                        Tinggi dan mudah diprototipekan | Belum cukup sumber spesifik                           |
| **8. Pendidikan**                                        | Agent tutor, pembuat feedback tugas, pencari materi, perencana belajar                          |                Tinggi, tetapi perlu evaluasi pedagogis | Belum cukup sumber spesifik                           |
| **9. Hukum/compliance**                                  | Agent mencari regulasi, membandingkan pasal, membuat ringkasan risiko                           |                                Menarik, tapi high-risk | Belum cukup sumber spesifik; perlu legal AI sources   |
| **10. Cybersecurity / governance**                       | Agent memantau alert, melakukan triage, membuat laporan insiden                                 |                        Tinggi, tapi butuh sandbox aman | Ada dukungan risiko/security agentic AI [6][4]        |

---

## 6. Bidang yang tampak paling realistis untuk skripsi mahasiswa

### A. Agentic RAG untuk dokumen kampus/perusahaan

**Kenapa cocok:**  
Topik ini paling aman dan realistis. Agent tidak perlu mengambil keputusan kritis, cukup mencari informasi dari dokumen resmi, menjawab pertanyaan, dan menyertakan sumber. Agentic search memang dikembangkan untuk mengatasi kelemahan RAG biasa yang cenderung single-turn dan kurang adaptif [1].

**Contoh judul:**

> “Pengembangan Agentic RAG untuk Asisten Informasi Akademik Berbasis Dokumen Kampus dengan Evaluasi Faithfulness dan Task Success Rate”

**Evaluasi:**

- akurasi jawaban,
- citation correctness,
- hallucination rate,
- waktu respons,
- kepuasan pengguna,
- perbandingan RAG biasa vs Agentic RAG.

---

### B. AI Agent untuk otomasi administrasi dokumen

**Kenapa cocok:**  
Administrasi banyak berisi workflow berulang: cek kelengkapan, klasifikasi dokumen, ekstraksi data, dan pembuatan draft. Ini cocok untuk agent karena multi-step dan tool-based.

**Contoh workflow:**

1. User upload dokumen.
2. Agent membaca dan mengekstrak informasi.
3. Agent mengecek kelengkapan berdasarkan SOP.
4. Agent memberi status: lengkap/tidak lengkap.
5. Agent membuat draft balasan.

**Contoh judul:**

> “Rancang Bangun AI Agent untuk Pemeriksaan Kelengkapan Dokumen Administrasi Berbasis SOP”

**Catatan:**  
Perlu sumber tambahan tentang penerapan agent di administrasi publik/enterprise sebelum dijadikan rekomendasi final.

---

### C. AI Agent untuk analisis keuangan sederhana

**Kenapa cocok:**  
Bidang finance sudah punya bukti awal yang cukup jelas. CFA Institute membahas penggunaan agentic AI dalam workflow keuangan dan menyoroti bahwa agent mulai masuk ke arus utama investasi, tetapi masih ada pertanyaan besar tentang trust dan production readiness [8].

**Contoh workflow:**

1. Ambil laporan keuangan.
2. Ekstrak metrik penting.
3. Bandingkan dengan periode sebelumnya.
4. Ambil berita terkait.
5. Buat ringkasan risiko dan peluang.
6. Minta approval manusia.

**Contoh judul:**

> “Evaluasi AI Agent untuk Ringkasan dan Analisis Awal Laporan Keuangan Perusahaan Publik”

**Evaluasi:**

- kesesuaian metrik,
- factual consistency,
- error rate,
- waktu analisis,
- perbandingan dengan analisis manual.

**Batasan:**  
Agent tidak boleh memberi rekomendasi investasi final tanpa disclaimer dan validasi manusia.

---

### D. AI Agent untuk software engineering

**Kenapa cocok:**  
Secara praktis sangat menarik untuk mahasiswa informatika: agent bisa membaca issue, mencari file terkait, membuat saran patch, atau membuat unit test. Namun, dalam evidence saat ini belum ada sumber spesifik software engineering, jadi ini masih perlu expanded search.

**Contoh judul sementara:**

> “Evaluasi AI Agent untuk Issue Triage dan Rekomendasi Perbaikan Bug pada Repository Open Source”

**Evaluasi:**

- task completion rate,
- akurasi klasifikasi issue,
- kualitas rekomendasi,
- jumlah patch yang berhasil melewati test,
- biaya token/API.

**Status:**  
Menarik, tapi perlu tambahan paper benchmark seperti SWE-bench, AgentBench, atau studi LLM coding agents.

---

### E. AI Agent untuk customer service berbasis knowledge base

**Kenapa cocok:**  
Workflow customer service jelas: memahami tiket, mencari referensi, membuat jawaban, mengeskalasi jika tidak yakin. Ini sangat cocok untuk human-in-the-loop.

**Contoh judul:**

> “Implementasi AI Agent untuk Triage dan Draft Respons Customer Service Berbasis Knowledge Base”

**Evaluasi:**

- akurasi klasifikasi tiket,
- response relevance,
- escalation accuracy,
- waktu penyelesaian,
- tingkat penerimaan jawaban oleh manusia.

**Status:**  
Perlu sumber industri tambahan dari vendor/cloud/customer service platform.

---

### F. AI Agent untuk robotik sederhana

**Kenapa cocok:**  
Jika kampus punya lab robotik, agentic AI bisa digunakan sebagai high-level planner. Survei embodied agentic AI membahas integrasi LLM/VLM dengan sistem robot melalui toolset, task list, perception, dan action [2].

**Contoh judul:**

> “Integrasi LLM Agent sebagai High-Level Planner pada Robot Mobile untuk Eksekusi Instruksi Bahasa Alami”

**Evaluasi:**

- success rate task,
- jumlah langkah,
- error recovery,
- waktu eksekusi,
- safety violation.

**Batasan:**  
Lebih kompleks daripada RAG/document agent karena melibatkan hardware, sensor, dan lingkungan fisik.

---

## 7. Gap riset yang paling menjanjikan untuk skripsi

Dari sumber yang ada, gap paling aman untuk dijadikan riset bukan sekadar “membangun agent”, tetapi **mengevaluasi kualitas dan batasannya**. MIT AI Agent Index menunjukkan bahwa dokumentasi safety, evaluasi, dan transparansi agent masih bervariasi [4]. Sumber terkait keamanan untuk NIST juga menekankan bahwa agentic AI membawa risiko baru karena mampu melakukan planning, tool use, dan interaksi dengan environment [6].

Gap yang bisa dijadikan kontribusi skripsi:

| Gap                          | Ide kontribusi skripsi                                                            |
| ---------------------------- | --------------------------------------------------------------------------------- |
| **Reliability**              | Bandingkan agentic workflow vs workflow non-agentic.                              |
| **Hallucination**            | Ukur hallucination rate pada Agentic RAG.                                         |
| **Tool-use accuracy**        | Evaluasi apakah agent memilih tool/API yang benar.                                |
| **Human-in-the-loop**        | Uji kapan agent perlu meminta approval manusia.                                   |
| **Cost efficiency**          | Bandingkan biaya token/API antara agent multi-step dan baseline.                  |
| **Safety guardrail**         | Tambahkan validasi aturan, policy checker, atau approval layer.                   |
| **Local Indonesian context** | Bangun dataset dokumen Bahasa Indonesia: SOP kampus, regulasi lokal, FAQ layanan. |
| **Evaluation framework**     | Buat rubric evaluasi agent untuk domain tertentu.                                 |

---

## 8. Topik skripsi tentatif

> Ini belum rekomendasi final. Daftar berikut adalah kandidat awal yang perlu divalidasi dengan sumber tambahan.

### 1. Agentic RAG untuk asisten akademik kampus

**Pertanyaan riset:**  
Apakah Agentic RAG menghasilkan jawaban lebih akurat dan lebih sedikit hallucination dibanding RAG biasa?

**Metode:**  
Bangun dua sistem: baseline RAG dan Agentic RAG. Uji pada pertanyaan mahasiswa tentang aturan akademik.

**Metrik:**  
Accuracy, faithfulness, citation correctness, hallucination rate, response time.

**Sumber pendukung utama:** [1]

---

### 2. AI Agent untuk pemeriksaan kelengkapan dokumen administrasi

**Pertanyaan riset:**  
Seberapa efektif AI Agent dalam mengecek kelengkapan dokumen berdasarkan SOP?

**Metode:**  
Agent membaca dokumen PDF/form, mengekstrak field, lalu membandingkan dengan checklist.

**Metrik:**  
Precision/recall ekstraksi, task success rate, waktu proses, human correction rate.

**Sumber pendukung:** [3][7], tetapi perlu sumber tambahan.

---

### 3. AI Agent untuk ringkasan laporan keuangan

**Pertanyaan riset:**  
Apakah AI Agent dapat membantu membuat ringkasan awal laporan keuangan secara faktual dan efisien?

**Metode:**  
Agent membaca laporan keuangan, mengekstrak metrik, membandingkan tahun, dan membuat ringkasan.

**Metrik:**  
Factual consistency, financial metric accuracy, time saved, human review score.

**Sumber pendukung:** [8][5]

---

### 4. AI Agent untuk issue triage pada repository GitHub

**Pertanyaan riset:**  
Apakah AI Agent dapat mengklasifikasi issue dan menyarankan file terkait secara akurat?

**Metode:**  
Gunakan dataset issue GitHub open-source. Agent membaca issue, label, file, dan commit history.

**Metrik:**  
Label accuracy, top-k file localization, task success rate, cost per task.

**Sumber pendukung:**  
Belum cukup dalam evidence ini; perlu expanded search.

---

### 5. AI Agent untuk customer service knowledge base

**Pertanyaan riset:**  
Apakah agent berbasis knowledge base dapat menurunkan waktu respons tanpa meningkatkan kesalahan jawaban?

**Metode:**  
Agent mengklasifikasi tiket, mengambil dokumen, membuat draft jawaban, dan menentukan eskalasi.

**Metrik:**  
Response relevance, escalation accuracy, average handling time, human acceptance rate.

**Sumber pendukung:**  
Belum cukup dalam evidence ini; perlu expanded search.

---

### 6. AI Agent sebagai planner untuk robot sederhana

**Pertanyaan riset:**  
Apakah LLM Agent dapat menerjemahkan instruksi bahasa alami menjadi urutan aksi robot yang benar?

**Metode:**  
Agent menerima instruksi, membuat task list, memanggil fungsi robot/simulator.

**Metrik:**  
Task success rate, jumlah error, safety violation, execution time.

**Sumber pendukung:** [2][5]

---

## 9. Risiko utama yang wajib dibahas dalam skripsi

| Risiko            | Penjelasan                                                             | Mitigasi                                               |
| ----------------- | ---------------------------------------------------------------------- | ------------------------------------------------------ |
| **Hallucination** | Agent bisa membuat jawaban yang terdengar benar tetapi salah.          | RAG, citation, verification step.                      |
| **Tool misuse**   | Agent bisa memilih tool/API yang salah.                                | Tool schema, permission control, logging.              |
| **Over-autonomy** | Agent mengambil keputusan tanpa approval.                              | Human-in-the-loop.                                     |
| **Privasi data**  | Dokumen bisa mengandung data pribadi.                                  | Anonimisasi, local model, akses terbatas.              |
| **Security**      | Agent bisa dimanipulasi melalui prompt injection atau input berbahaya. | Input filtering, sandbox, policy checker.              |
| **Biaya API**     | Agent multi-step bisa mahal.                                           | Batasi step, caching, model routing.                   |
| **Reliability**   | Hasil bisa tidak konsisten antar-run.                                  | Evaluasi berulang, deterministic settings, guardrails. |
| **Bias**          | Agent bisa memberi hasil tidak adil.                                   | Audit dataset dan evaluasi fairness jika relevan.      |

Risiko keamanan agentic AI perlu diperhatikan karena agent dapat melakukan autonomous planning, tool use, dan interaksi dengan environment [6]. MIT AI Agent Index juga menunjukkan pentingnya aspek safety, transparency, autonomy control, dan evaluation [4].

---

## 10. Kesimpulan sementara

Berdasarkan evidence yang tersedia, bidang yang **paling aman dan realistis untuk skripsi 2026** secara sementara adalah:

1. **Agentic RAG / knowledge assistant**
2. **Otomasi administrasi dokumen**
3. **Analisis/ringkasan keuangan dengan human review**
4. **Customer service berbasis knowledge base**
5. **Software engineering agent**
6. **Robotik agentic planner**, jika ada fasilitas lab

Namun, ini **belum boleh dianggap rekomendasi final** karena sumber untuk beberapa domain masih kurang. Bukti paling kuat saat ini mendukung agentic search/RAG [1], robotik/embodied AI [2], finance [8], arsitektur Agentic AI umum [5], serta safety/governance [4][6][7].

---

## 11. Rekomendasi langkah riset lanjutan

Sebelum menentukan judul akhir, sebaiknya lakukan expanded search untuk:

1. **AI agents in education 2024 2025 systematic review**
2. **LLM agents for software engineering SWE-bench AgentBench 2024 2025**
3. **agentic AI customer service enterprise use cases 2025**
4. **AI agents healthcare workflow automation review 2025**
5. **AI agents legal compliance document review 2025**
6. **agentic AI public administration government services 2025**
7. **LLM agent evaluation benchmark tool use reliability 2025**
8. **prompt injection and security risks for AI agents 2025**

Jika expanded search berhasil, barulah bisa dibuat **laporan final** berisi ranking bidang, matriks kelayakan lengkap, dan 5–10 rekomendasi topik skripsi yang lebih kuat.

## Audit Notes

The following claims were not fully supported by accepted evidence and should be treated as caveated:

- Artefak Riset Sementara — Peluang Skripsi AI Agent / Agentic AI 2026
- > **Status bukti: belum memenuhi target Deep Research penuh.**
- > Evidence yang terbaca baru **8 sumber**, tetapi cakupan domain dan sumber industri masih belum cukup kuat untuk membuat kesimpulan final.
- Beberapa bidang seperti pendidikan, software engineering, customer service, HR, hukum, dan administrasi publik masih kurang bukti spesifik.
- Karena itu, dokumen ini adalah **peta awal berbasis sumber**, bukan rekomendasi akhir.
- > **Saran:** lakukan **retry / expanded search** untuk menambah sumber domain-spesifik sebelum memilih topik skripsi secara final.
