# PRD: Deep Search Multi-Agent Research System

## 1. Ringkasan Produk

Produk ini adalah sistem **deep research berbasis multi-agent** menggunakan CrewAI, dengan integrasi **Exa** untuk external semantic search dan **Qdrant** untuk long-term research memory.

Sistem bertujuan menghasilkan jawaban riset yang lebih akurat, terverifikasi, berbasis bukti, dan mampu melakukan iterasi pencarian tambahan jika bukti belum cukup.

---

## 2. Tujuan Produk

Membangun research engine yang mampu:

1. Memahami pertanyaan user secara mendalam.
2. Memecah pertanyaan menjadi sub-riset.
3. Mencari sumber eksternal menggunakan Exa.
4. Mengambil konteks historis/internal dari Qdrant.
5. Menilai kualitas sumber.
6. Mengekstrak klaim dan bukti.
7. Menemukan kontradiksi.
8. Menulis jawaban final dengan confidence level.
9. Melakukan review sebelum jawaban dikirim.
10. Mengulang proses riset bila evidence belum mencukupi.

---

## 3. Target Pengguna

Produk ini ditujukan untuk:

* Research analyst
* Product strategist
* Market intelligence team
* AI research team
* Consultant
* Founder / operator
* Knowledge management team
* Developer yang membangun AI research assistant

---

## 4. Masalah yang Diselesaikan

Riset manual atau single-agent search biasanya memiliki masalah:

* Jawaban terlalu dangkal.
* Sumber tidak diverifikasi.
* Tidak membedakan fakta, opini, dan prediksi.
* Tidak mencari kontradiksi.
* Tidak menyimpan hasil riset untuk digunakan ulang.
* Tidak tahu kapan perlu melakukan pencarian tambahan.
* Sering hallucinate karena tidak ada evidence gate.

Sistem ini menyelesaikan masalah tersebut dengan pendekatan:

```text
manager-led multi-agent research + external search + vector memory + critic verification
```

---

## 5. Ruang Lingkup Produk

### In Scope

* Multi-agent CrewAI architecture.
* Custom Manager Agent.
* Integrasi Exa tools.
* Integrasi Qdrant vector memory.
* Source deduplication.
* Source quality scoring.
* Evidence extraction.
* Contradiction analysis.
* Final synthesis.
* Verification critic.
* Iterative research loop.
* Model assignment per agent menggunakan OpenAI ecosystem.

### Out of Scope untuk MVP

* Full browser automation.
* Login-gated source crawling.
* Paid database integrations.
* Real-time news monitoring.
* Human approval UI.
* Multi-user dashboard.
* Advanced citation graph visualization.

---

## 6. Arsitektur High-Level

```text
User Question
     |
     v
Custom Manager Agent
     |
     +--> Search Planner Agent
     |
     +--> Exa Research Agent
     |
     +--> Qdrant Memory Agent
     |
     +--> Source Triage Agent
     |
     +--> Evidence Analyst Agent
     |
     +--> Synthesis Writer Agent
     |
     +--> Verification Critic Agent
     |
     v
Final Evidence-Backed Answer
```

---

## 7. Agent Design

### 7.1 Custom Manager Agent

**Role:** Deep Research Manager

**Tujuan:**
Mengatur seluruh proses riset, mendelegasikan tugas ke agent lain, memutuskan apakah bukti sudah cukup, dan meminta pencarian ulang jika masih ada gap.

**Tanggung jawab:**

* Memahami intent user.
* Menentukan research plan.
* Mendelegasikan tugas.
* Mengevaluasi hasil tiap agent.
* Memutuskan apakah perlu search tambahan.
* Mengakhiri proses hanya jika jawaban sudah evidence-backed.

**LLM rekomendasi:**
Model OpenAI paling kuat / reasoning model.

---

### 7.2 Search Planner Agent

**Role:** Search Strategy Architect

**Tujuan:**
Membuat strategi pencarian yang luas dan dalam.

**Tanggung jawab:**

* Membuat query semantic untuk Exa.
* Membuat query contradiction-seeking.
* Membuat query untuk Qdrant.
* Menentukan source type yang perlu dicari.
* Menentukan freshness requirement.

**LLM rekomendasi:**
`gpt-4.1-mini`

---

### 7.3 Exa Research Agent

**Role:** Exa Web Intelligence Researcher

**Tujuan:**
Mengumpulkan sumber eksternal berkualitas tinggi.

**Tanggung jawab:**

* Menjalankan Exa search.
* Mengambil konten halaman.
* Melakukan similar-source expansion.
* Mengumpulkan metadata sumber.
* Menyusun source pack.

**Tools:**

* `exa_search`
* `exa_search_and_contents`
* `exa_find_similar`
* `exa_get_contents`

**LLM rekomendasi:**
`gpt-4.1-mini`

---

### 7.4 Qdrant Memory Agent

**Role:** Research Memory Specialist

**Tujuan:**
Mengambil dan menyimpan pengetahuan riset dari memory jangka panjang.

**Tanggung jawab:**

* Mencari riset terdahulu di Qdrant.
* Mengambil chunk relevan.
* Menandai memory yang stale.
* Menyimpan hasil riset baru.
* Menyimpan claims, metadata, confidence, dan source.

**Tools:**

* `qdrant_search`
* `qdrant_upsert_documents`

**LLM rekomendasi:**
`gpt-4.1-mini`

---

### 7.5 Source Triage Agent

**Role:** Source Triage and Credibility Analyst

**Tujuan:**
Menilai, membersihkan, dan memprioritaskan sumber.

**Tanggung jawab:**

* Deduplicate URL.
* Menilai kualitas sumber.
* Memprioritaskan primary source.
* Mengelompokkan sumber berdasarkan sub-question.
* Menolak sumber lemah.

**Tools:**

* `dedupe_sources`
* `score_source_quality`

**LLM rekomendasi:**
`gpt-4.1` atau `gpt-4.1-mini` untuk mode hemat.

---

### 7.6 Evidence Analyst Agent

**Role:** Evidence and Contradiction Analyst

**Tujuan:**
Mengekstrak klaim dan menilai kekuatan bukti.

**Tanggung jawab:**

* Mengekstrak atomic claims.
* Menghubungkan claim dengan source.
* Menemukan kontradiksi.
* Memberikan confidence level.
* Membedakan fakta, opini, estimasi, dan forecast.

**LLM rekomendasi:**
`gpt-4.1` atau reasoning model kuat.

---

### 7.7 Synthesis Writer Agent

**Role:** Executive Research Synthesizer

**Tujuan:**
Menulis jawaban final yang jelas, ringkas, dan berbasis evidence.

**Tanggung jawab:**

* Menyusun jawaban final.
* Menjelaskan caveat.
* Menyertakan confidence level.
* Menghindari unsupported claim.
* Membuat output mudah dibaca.

**LLM rekomendasi:**
`gpt-4.1`

---

### 7.8 Verification Critic Agent

**Role:** Final Verification Critic

**Tujuan:**
Menjadi quality gate sebelum jawaban dikirim ke user.

**Tanggung jawab:**

* Mengecek unsupported claims.
* Mengecek sumber lemah.
* Mengecek kontradiksi yang belum dijawab.
* Mengecek overconfidence.
* Mengembalikan `APPROVED` atau `REVISION REQUIRED`.

**LLM rekomendasi:**
Model OpenAI paling kuat / reasoning model.

---

## 8. Research Workflow

### 8.1 Main Flow

```text
1. User memberikan pertanyaan.
2. Manager Agent membuat research objective.
3. Search Planner membuat search strategy.
4. Exa Research Agent mencari external sources.
5. Qdrant Memory Agent mengambil prior research.
6. Source Triage Agent membersihkan dan menilai sumber.
7. Evidence Analyst membuat evidence table.
8. Synthesis Writer menulis jawaban.
9. Verification Critic melakukan audit.
10. Manager Agent memutuskan approve atau rework.
```

---

## 9. Iterative Loop Design

Sistem tidak hanya berjalan linear satu kali.

Loop utama dikendalikan oleh **Custom Manager Agent**.

```text
Search → Evidence → Synthesis → Critic → Manager Decision
```

Jika critic menemukan gap:

```text
REVISION REQUIRED
     |
     v
Manager Agent
     |
     v
Focused follow-up search
```

Loop berhenti jika:

* Verification Critic mengembalikan `APPROVED`.
* Manager menilai evidence sudah cukup.
* Max iteration tercapai.
* Timeout tercapai.
* Error tidak bisa dipulihkan.

### Prinsip desain

```text
Custom Manager Agent = intelligence loop
max_iterations = safety guard
Verification Critic = quality gate
Qdrant = memory loop
Exa = discovery loop
```

---

## 10. Tooling Requirements

### 10.1 Exa Tools

Sistem membutuhkan wrapper tools:

```text
exa_search
exa_search_and_contents
exa_find_similar
exa_get_contents
```

Fungsi utama:

* Semantic web search.
* Similar-page discovery.
* Source expansion.
* Content extraction.

---

### 10.2 Qdrant Tools

Sistem membutuhkan wrapper tools:

```text
qdrant_search
qdrant_upsert_documents
```

Fungsi utama:

* Semantic retrieval.
* Long-term research memory.
* Claim storage.
* Source metadata storage.

Data yang disimpan:

```json
{
  "text": "Extracted chunk text",
  "claim": "Atomic claim",
  "source_url": "https://example.com",
  "source_title": "Source title",
  "source_type": "primary_report",
  "published_date": "2025-10-01",
  "retrieved_at": "2026-04-25",
  "confidence": "medium",
  "topic_tags": ["market", "ai", "regulation"],
  "contradicted_by": []
}
```

---

### 10.3 Source Utility Tools

```text
dedupe_sources
score_source_quality
claim_extractor
citation_guard
```

Untuk MVP, minimal:

```text
dedupe_sources
score_source_quality
```

---

## 11. LLM Assignment

### Balanced Production Setup

| Agent               | Model                            |
| ------------------- | -------------------------------- |
| Manager Agent       | Strongest OpenAI reasoning model |
| Search Planner      | `gpt-4.1-mini`                   |
| Exa Research Agent  | `gpt-4.1-mini`                   |
| Qdrant Memory Agent | `gpt-4.1-mini`                   |
| Source Triage Agent | `gpt-4.1`                        |
| Evidence Analyst    | `gpt-4.1`                        |
| Synthesis Writer    | `gpt-4.1`                        |
| Verification Critic | Strongest OpenAI reasoning model |

### Cost-Optimized Setup

| Agent               | Model          |
| ------------------- | -------------- |
| Manager Agent       | `gpt-4.1`      |
| Search Planner      | `gpt-4.1-mini` |
| Exa Research Agent  | `gpt-4.1-mini` |
| Qdrant Memory Agent | `gpt-4.1-mini` |
| Source Triage Agent | `gpt-4.1-mini` |
| Evidence Analyst    | `gpt-4.1`      |
| Synthesis Writer    | `gpt-4.1-mini` |
| Verification Critic | `gpt-4.1`      |

### Quality-Max Setup

| Agent               | Model                            |
| ------------------- | -------------------------------- |
| Manager Agent       | Strongest OpenAI reasoning model |
| Search Planner      | `gpt-4.1`                        |
| Exa Research Agent  | `gpt-4.1-mini`                   |
| Qdrant Memory Agent | `gpt-4.1-mini`                   |
| Source Triage Agent | `gpt-4.1`                        |
| Evidence Analyst    | Strongest OpenAI reasoning model |
| Synthesis Writer    | `gpt-4.1`                        |
| Verification Critic | Strongest OpenAI reasoning model |

---

## 12. Functional Requirements

### FR-1: User Question Intake

Sistem harus menerima pertanyaan user sebagai input utama.

### FR-2: Research Planning

Sistem harus membuat research objective, sub-question, evidence requirement, dan risk area.

### FR-3: Search Strategy Generation

Sistem harus membuat search strategy untuk Exa dan Qdrant.

### FR-4: External Search

Sistem harus menggunakan Exa untuk menemukan dan mengambil sumber eksternal.

### FR-5: Memory Retrieval

Sistem harus mengambil prior knowledge dari Qdrant.

### FR-6: Source Triage

Sistem harus melakukan deduplication dan source quality scoring.

### FR-7: Evidence Extraction

Sistem harus mengekstrak claim, source, contradiction, dan confidence level.

### FR-8: Final Synthesis

Sistem harus menghasilkan jawaban final berbasis evidence.

### FR-9: Verification

Sistem harus mengaudit jawaban final dan menghasilkan status:

```text
APPROVED
```

atau

```text
REVISION REQUIRED
```

### FR-10: Iterative Rework

Sistem harus bisa melakukan focused follow-up search jika evidence belum cukup.

### FR-11: Memory Write-Back

Sistem harus menyimpan hasil riset penting ke Qdrant.

---

## 13. Non-Functional Requirements

### Reliability

* Sistem harus memiliki max iteration guard.
* Sistem harus memiliki timeout.
* Tool error harus dikembalikan secara eksplisit, bukan disembunyikan.

### Accuracy

* Jawaban final tidak boleh berisi klaim besar tanpa evidence.
* Sumber harus diberi confidence.
* Kontradiksi harus disebutkan.

### Maintainability

* Setiap tool harus diisolasi dalam file terpisah.
* Exa dan Qdrant wrapper harus mudah diganti.
* Prompt agent dan task harus berada di YAML config.

### Observability

* Simpan log:

  * query yang dipakai
  * sumber yang ditemukan
  * sumber yang ditolak
  * critic feedback
  * final approval status

### Cost Control

* Gunakan model kecil untuk search-heavy agents.
* Gunakan model kuat hanya untuk manager, evidence, synthesis, dan critic.
* Batasi jumlah search result per pass.
* Batasi iteration count.

---

## 14. MVP Scope

MVP cukup mencakup:

```text
1. Custom Manager Agent
2. Search Planner Agent
3. Exa Research Agent
4. Qdrant Memory Agent
5. Source Triage Agent
6. Evidence Analyst Agent
7. Synthesis Writer Agent
8. Verification Critic Agent
9. Exa tools
10. Qdrant tools
11. Sequential or hierarchical CrewAI execution
12. Max iteration guard
13. Markdown final report
```

---

## 15. Success Metrics

### Quality Metrics

* Persentase jawaban dengan source-backed claims.
* Jumlah unsupported claims yang lolos critic.
* Coverage sub-question.
* Jumlah kontradiksi yang berhasil ditemukan.

### Retrieval Metrics

* Relevance score sumber.
* Duplicate source ratio.
* Primary source ratio.
* Freshness score.

### Operational Metrics

* Average cost per research run.
* Average latency per research run.
* Average iteration count.
* Tool failure rate.

### User Metrics

* User satisfaction score.
* Jawaban yang diterima tanpa rerun.
* Jumlah riset yang disimpan dan digunakan ulang dari Qdrant.

---

## 16. Acceptance Criteria

MVP dianggap berhasil jika:

1. User bisa memasukkan pertanyaan riset.
2. Sistem membuat research plan.
3. Sistem mengambil sumber dari Exa.
4. Sistem mengambil memory dari Qdrant.
5. Sistem melakukan source triage.
6. Sistem membuat evidence table.
7. Sistem menghasilkan final answer.
8. Critic bisa mengembalikan `APPROVED` atau `REVISION REQUIRED`.
9. Sistem bisa melakukan minimal satu focused rework pass.
10. Hasil riset bisa disimpan kembali ke Qdrant.

---

## 17. Risiko dan Mitigasi

| Risiko                  | Mitigasi                                             |
| ----------------------- | ---------------------------------------------------- |
| Search result buruk     | Gunakan query expansion dan similar-source discovery |
| Hallucination           | Evidence table + critic gate                         |
| Infinite loop           | Max iteration dan timeout                            |
| Biaya tinggi            | Model routing dan result limit                       |
| Memory stale            | Simpan `retrieved_at` dan `published_date`           |
| Source bias             | Contradiction search                                 |
| Tool API berubah        | Isolasi wrapper Exa/Qdrant                           |
| Jawaban terlalu panjang | Output template dan synthesis constraint             |

---

## 18. Rekomendasi Implementasi

Gunakan:

```text
CrewAI hierarchical process
Custom Manager Agent
Exa for external discovery
Qdrant for semantic memory
OpenAI model routing per agent
Verification Critic as quality gate
Max iteration guard as safety brake
```

Desain final yang direkomendasikan:

```text
Manager-led hierarchical multi-agent research system
with Exa discovery, Qdrant memory, evidence analysis,
critic verification, and guarded iterative rework.
```

