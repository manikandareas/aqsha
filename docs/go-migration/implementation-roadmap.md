# Aqsha Go Migration — Implementation Roadmap

Dokumen ini menerjemahkan [architecture and stack specification](./architecture-and-stack-spec.md) menjadi urutan eksekusi yang dapat diverifikasi.

Spec menentukan keputusan architecture, ownership, library, dan target topology. Dokumen ini menentukan pekerjaan berikutnya, exit criteria, urutan cutover, serta kondisi rollback.

## 1. Tujuan

Roadmap ini bertujuan untuk:

- membangun fondasi Go tanpa mengganggu runtime TypeScript yang sedang berjalan;
- memindahkan capability secara bertahap, bukan melakukan rewrite besar sekaligus;
- menjaga behavior API, tenant isolation, retry, idempotency, dan observability;
- mempertahankan Mastra agent dan LLM streaming di TypeScript;
- mempertahankan extraction, OCR, citation processing, dan RAG pada Node worker sampai contract dan parity-nya siap;
- menunda Python/Daytona sampai use case statistical analysis benar-benar tersedia.

## 2. Prinsip eksekusi

### 2.1 Spec tetap menjadi decision source

Jika ditemukan konflik antara roadmap ini dan spec, keputusan architecture harus diperbarui di spec terlebih dahulu. Roadmap hanya mengatur urutan implementasi.

### 2.2 Satu capability hanya memiliki satu owner

Pada setiap tahap, harus jelas runtime yang memiliki:

- API write dan read;
- business rule;
- persistence rule;
- queue producer;
- queue consumer;
- retry dan terminal-failure policy.

Tidak boleh ada Go dan TypeScript yang memproses job yang sama dengan semantics berbeda.

### 2.3 Migrasi per vertical slice

Satu vertical slice harus memindahkan seluruh bagian capability yang diperlukan:

```text
HTTP contract
  -> auth dan authorization
  -> application service
  -> database/storage access
  -> queue producer atau consumer
  -> tests
  -> logs, traces, metrics, dan error reporting
```

Memindahkan hanya route atau hanya worker tanpa service dan persistence rule akan menciptakan dua sumber business logic.

### 2.4 Rollback harus tersedia sebelum cutover

Setiap capability yang dipindahkan harus dapat dikembalikan ke runtime lama melalui feature flag, routing switch, producer switch, atau deployment rollback. Cutover tidak boleh menjadi operasi satu arah.

## 3. Kondisi awal yang harus dipertahankan

Runtime saat ini memiliki batas berikut:

| Area | Runtime saat ini | Arah migrasi |
| --- | --- | --- |
| Public/application API | `apps/api` dengan Bun/Elysia | Bertahap ke Go API |
| Mastra agent dan LLM streaming | `apps/agent` dengan Node/Mastra | Tetap TypeScript |
| Extraction, OCR, citation processing, RAG sementara | Node worker | Tetap di `apps/agent` sebagai process terpisah |
| Statistical analysis | Python/Daytona | Priority terakhir |
| PostgreSQL schema dan migration | `packages/db` dengan Drizzle | Drizzle tetap migration owner selama schema shared |
| Existing queue | BullMQ/Redis | Dipertahankan untuk capability Node |
| Go-owned queue | Belum menjadi owner global | River hanya untuk job Go |

Repository pointers:

- [`apps/api/src/routes`](../../apps/api/src/routes)
- [`apps/api/src/workers`](../../apps/api/src/workers)
- [`apps/agent`](../../apps/agent)
- [`packages/db`](../../packages/db)
- [`packages/services`](../../packages/services)

## 4. Milestone overview

```text
M0  Contract dan inventory
  |
M1  Go foundation
  |
M2  First vertical slice
  |
M3  Node document-worker consolidation
  |
M4  Go domain ownership per capability
  |
M5  Go retrieval core
  |
M6  Optional document-format migration
  |
M7  Python/Daytona statistical analysis
```

Milestone berikutnya hanya boleh dimulai jika exit criteria milestone sebelumnya terpenuhi. Beberapa aktivitas observability, test harness, dan documentation dapat berjalan paralel selama tidak mengubah ownership.

## 5. M0 — Contract dan inventory

### Tujuan

Membuktikan bahwa behavior yang akan dimigrasikan sudah diketahui dan tidak ada ownership yang ambigu.

### Pekerjaan

- inventaris semua route API dan kelompokkan berdasarkan capability;
- inventaris semua queue, producer, consumer, payload, stable job ID, retry, backoff, concurrency, dan terminal failure;
- petakan setiap capability ke owner runtime saat ini dan target owner;
- dokumentasikan database tables, columns, transaction boundary, dan migration owner;
- dokumentasikan auth context, user/workspace scope, dan authorization rule;
- dokumentasikan application error code dan HTTP status yang sedang digunakan;
- pisahkan contract yang public, internal, dan Node document-processing;
- pilih kandidat read-only endpoint untuk vertical slice pertama;
- pilih kandidat worker deterministic pertama, yaitu `artifact-cleanup`, setelah ownership dan side effect-nya dipastikan;
- siapkan fixture/regression corpus non-sensitive untuk extraction, OCR, citation, dan RAG.

### Deliverables

- capability ownership matrix;
- API route inventory;
- queue/job inventory;
- database ownership matrix;
- error contract matrix;
- OpenAPI 3.0.3 baseline untuk capability yang dipilih;
- Node document-processing contract;
- idempotency dan retry matrix;
- regression corpus manifest;
- daftar dependency dan environment variable yang dibutuhkan Go.

### Exit criteria

- setiap endpoint memiliki target owner yang eksplisit;
- setiap queue memiliki satu consumer owner;
- tidak ada job yang berpotensi diproses oleh dua runtime;
- setiap side effect memiliki idempotency strategy;
- API error, auth context, dan tenant scope dapat diuji;
- contract client dapat diuji terhadap behavior API yang sedang berjalan;
- capability pertama dipilih berdasarkan stabilitas dan risiko, bukan sekadar ukuran code.

### Artefak yang disarankan

Dokumen pendukung dapat dipisah dari roadmap ini:

```text
docs/go-migration/contract-inventory.md
docs/go-migration/capability-ownership-matrix.md
docs/go-migration/queue-contracts.md
docs/go-migration/document-processing-contract.md
```

## 6. M1 — Go foundation

### Tujuan

Membuat runtime Go yang dapat dijalankan, diobservasi, dites, dan dihentikan dengan benar sebelum business capability dipindahkan.

### Target layout

```text
apps/api-go/
├── cmd/
│   ├── api/
│   └── worker/
├── internal/
│   ├── app/
│   ├── config/
│   ├── domain/
│   ├── httpapi/
│   ├── infrastructure/
│   ├── jobs/
│   ├── observability/
│   └── storage/
├── api/
│   └── openapi.yaml
├── migrations/                 # hanya jika ownership sudah dipindahkan
├── go.mod
└── go.sum
```

Migration tidak boleh langsung dibuat di `apps/api-go` untuk tabel yang masih dimiliki Drizzle.

### Pekerjaan

- buat module Go dan `cmd/api` serta `cmd/worker`;
- implement configuration loader dengan fail-fast untuk env wajib;
- implement `net/http` + `chi` composition root;
- implement OpenAPI generated strict handler dan request validation middleware;
- implement Clerk token verification dan request principal;
- implement `pgxpool` connection health/readiness;
- implement structured logging dengan `log/slog`;
- implement OpenTelemetry tracing dan metrics boundary;
- implement Sentry error reporting dengan redaction;
- implement graceful shutdown untuk HTTP server, pool, worker, tracer, dan storage client;
- tambahkan lint, unit test, integration test, race test, dan vulnerability scan;
- siapkan local development command dan health check container.

### Exit criteria

- API dapat boot dengan dependency yang eksplisit;
- konfigurasi invalid menyebabkan fail-fast dengan error yang actionable;
- liveness tidak menyamarkan dependency yang belum siap;
- readiness memeriksa dependency yang benar-benar dibutuhkan process;
- request memiliki correlation/request ID dan trace context;
- protected route dapat membedakan unauthenticated dan unauthorized;
- shutdown tidak meninggalkan goroutine, connection, atau worker task;
- CI dapat menjalankan format, lint, test, race, dan build.

## 7. M2 — First vertical slice

### Tujuan

Membuktikan bahwa satu capability dapat berjalan di Go dengan parity yang terukur dan rollback yang aman.

### Pemilihan capability

Urutan default:

1. satu endpoint read-only yang stabil dan memiliki tenant-scope jelas;
2. `artifact-cleanup` sebagai worker deterministic pertama.

Endpoint pertama harus dipilih setelah M0. Hindari endpoint yang langsung bergantung pada Mastra streaming, extraction/OCR, billing provider, atau contract yang masih berubah.

### Pekerjaan API

- definisikan endpoint dan schema di OpenAPI;
- generate server interface dan typed models;
- pasang request validation berbasis OpenAPI;
- implement auth context dan tenant scoping;
- implement query dengan `sqlc` dan `pgx`;
- map database result ke response DTO;
- pertahankan error code dan status behavior yang diperlukan client;
- tambahkan contract test terhadap API lama;
- expose route melalui internal/shadow path atau feature flag sebelum public cutover.

### Pekerjaan worker

- tetapkan job payload version;
- tetapkan stable idempotency key;
- tetapkan retryable dan non-retryable errors;
- tetapkan timeout dan concurrency limit;
- tetapkan terminal failure event dan Sentry context;
- pastikan transaction database dan object-storage side effect tidak menghasilkan duplicate mutation;
- tambahkan test untuk retry, duplicate delivery, cancellation, dan graceful shutdown.

### Exit criteria

- response dan error parity terukur;
- producer dan consumer owner sudah tunggal;
- retry dan terminal-failure behavior setara dengan runtime sebelumnya;
- duplicate delivery tidak menghasilkan duplicate mutation;
- metrics, trace, log, dan error reporting tersedia;
- feature flag atau routing switch dapat mengembalikan traffic ke runtime lama;
- tidak ada perubahan schema yang tidak diperlukan untuk slice pertama.

## 8. M3 — Node document-worker consolidation

### Tujuan

Menempatkan extraction, OCR, citation processing, dan RAG sementara dalam `apps/agent` sebagai worker process terpisah dari Mastra server.

### Target topology

```text
node-agent
  └── Mastra server, agent tools, LLM streaming

node-agent-worker
  └── extraction, OCR, citation processing, RAG sementara
```

Worker Node tidak boleh menginisialisasi Mastra server penuh jika job tersebut tidak membutuhkan Mastra runtime.

### Pekerjaan

- pindahkan registration document-related worker dari `apps/api` ke worker process di `apps/agent`;
- pertahankan BullMQ untuk job yang masih dimiliki Node;
- pisahkan worker entrypoint dari Mastra server entrypoint;
- definisikan processing request, result manifest, failure result, dan contract version;
- tambahkan max payload, timeout, cancellation, retry classification, dan idempotency key;
- simpan artefak besar di MinIO/R2, bukan di payload queue;
- instrument setiap stage dengan job ID, document ID, stage, attempt, dan contract version;
- jalankan regression corpus sebelum dan sesudah pemindahan;
- verifikasi bahwa producer dan consumer tidak terdaftar ganda.

### Exit criteria

- `node-agent` dan `node-agent-worker` dapat restart dan scale independently;
- streaming agent tetap tidak berubah;
- extraction/OCR/citation/RAG regression corpus lulus;
- payload queue tidak berisi data besar atau secret;
- queue failure dapat dilacak sampai stage yang gagal;
- worker tidak membutuhkan initialization Mastra yang tidak relevan;
- rollback registration ke runtime sebelumnya tersedia.

## 9. M4 — Go domain ownership

### Urutan capability

Pindahkan satu capability pada satu waktu:

1. artifact metadata dan lifecycle;
2. workspace read/write permission;
3. object-storage metadata;
4. cleanup dan deletion orchestration;
5. billing/webhook boundary;
6. deterministic integration jobs.

Urutan dapat berubah setelah M0 jika dependency atau risk assessment menunjukkan prioritas lain. Namun setiap capability harus dipindahkan secara utuh, meliputi API, service, persistence, producer, consumer, tests, dan observability.

### Checklist per capability

- [ ] current behavior terdokumentasi;
- [ ] target owner disetujui;
- [ ] OpenAPI/internal contract tersedia;
- [ ] authorization dan tenant scope tersedia;
- [ ] domain invariant tersedia;
- [ ] query dan transaction boundary tersedia;
- [ ] queue contract tersedia jika ada asynchronous work;
- [ ] idempotency dan retry test tersedia;
- [ ] metrics dan trace tersedia;
- [ ] feature flag/cutover switch tersedia;
- [ ] rollback tervalidasi;
- [ ] old producer/consumer dinonaktifkan setelah cutover;
- [ ] dead code dan ownership lama dibersihkan setelah stabil.

## 10. M5 — Go retrieval core

### Prasyarat

Retrieval tidak boleh dipindahkan sebelum document-processing contract dan manifest stabil. Go harus menerima hasil processing yang versioned, bukan menebak hasil extraction Node.

### Scope

- chunking yang contract-nya sudah ditetapkan;
- embedding request orchestration;
- pgvector write dan search;
- hybrid retrieval;
- delete dan reindex;
- internal retrieval contract untuk Mastra tool.

### Exit criteria

- retrieval parity terhadap implementasi sebelumnya terukur;
- embedding model, dimension, version, dan distance metric tercatat;
- reindex dan delete idempotent;
- stale vector dapat dideteksi dan dibersihkan;
- Mastra tool dapat memakai retrieval contract tanpa mengubah LLM streaming behavior;
- rollback ke retrieval lama masih mungkin selama masa shadow comparison.

## 11. M6 — Optional document-format migration

Jangan memindahkan PDF, DOCX, atau OCR ke Go hanya karena Go menjadi backend utama.

Format hanya dipindahkan jika terdapat bukti bahwa:

- library Go memiliki fidelity yang cukup;
- output dapat dibandingkan dengan regression corpus;
- memory, timeout, dan failure behavior lebih baik atau lebih dapat dikendalikan;
- contract result tidak merusak citation dan RAG;
- operational cost dan maintenance benefit lebih besar daripada mempertahankan Node.

Jika bukti tidak cukup, Node document worker tetap menjadi owner.

## 12. M7 — Python/Daytona statistical analysis

Statistical analysis dimulai setelah use case konkret tersedia.

Prasyarat:

- analysis input schema versioned;
- input manifest disimpan di MinIO/R2;
- output artifact schema jelas;
- job timeout dan resource limit jelas;
- authorization dan tenant isolation jelas;
- result validation dilakukan sebelum commit ke PostgreSQL;
- failure, retry, dan cancellation behavior terdokumentasi.

Go berperan sebagai orchestration dan contract boundary. Python tetap menjadi runtime computation.

## 13. Testing strategy

### Contract tests

- generated Go handler terhadap OpenAPI;
- existing API behavior terhadap target response;
- authentication dan authorization matrix;
- error code/status parity;
- Node document-processing request/result contract.

### Integration tests

- PostgreSQL dengan schema yang relevan;
- Redis/BullMQ untuk Node worker contract;
- River untuk Go-owned jobs;
- MinIO/S3-compatible storage;
- Clerk token verification menggunakan test fixture atau test server yang sesuai.

### Concurrency and failure tests

- duplicate job delivery;
- retry setelah partial failure;
- cancellation melalui context;
- worker shutdown saat job aktif;
- connection pool exhaustion;
- timeout downstream;
- storage unavailable;
- database deadlock atau serialization retry.

### Document regression tests

Corpus minimum harus mencakup:

- PDF text-based;
- scanned PDF/OCR;
- DOCX;
- HTML/web page;
- malformed document;
- citation edge case;
- duplicate ingest;
- large document;
- document dengan encoding atau bahasa berbeda.

## 14. Observability dan operational readiness

Setiap migrated request/job minimal memiliki:

- `request_id` atau `job_id`;
- `trace_id`;
- `workspace_id` bila tersedia;
- `user_id` yang sudah direduksi atau diizinkan policy;
- capability dan operation name;
- runtime version;
- attempt number untuk job;
- duration dan outcome;
- error code, bukan raw secret atau payload sensitif.

Metrics minimum:

- API request count, latency, dan error rate;
- DB pool usage dan query latency;
- queue depth, active jobs, retry count, terminal failure count;
- worker processing duration per stage;
- storage operation latency/error;
- retrieval latency dan result count;
- Go memory, GC, dan goroutine count.

## 15. Cutover dan rollback

### Cutover levels

```text
1. local/test
2. internal endpoint
3. shadow read atau comparison mode
4. small traffic percentage
5. full capability cutover
6. old runtime cleanup setelah stabilization window
```

### Rollback triggers

Rollback dilakukan jika terjadi salah satu kondisi berikut:

- tenant isolation failure;
- duplicate mutation atau data corruption;
- error parity yang memecahkan client;
- queue ownership ambiguity;
- retry storm atau resource exhaustion;
- regression corpus gagal;
- observability tidak cukup untuk mendiagnosis failure;
- latency atau error budget memburuk di luar batas yang disepakati.

Rollback tidak boleh dilakukan dengan menghapus data atau mengubah migration history secara destruktif.

## 16. Immediate next actions

Pekerjaan konkret setelah roadmap ini disetujui:

### A. Buat inventory M0

- [ ] daftar route `apps/api/src/routes`;
- [ ] daftar worker `apps/api/src/workers`;
- [ ] mapping queue producer/consumer;
- [ ] mapping database table dan service owner;
- [ ] mapping auth dan workspace scope;
- [ ] mapping error code/status;
- [ ] pilih first read-only vertical slice;
- [ ] pilih fixture document non-sensitive.

### B. Finalisasi contract

- [ ] tulis OpenAPI untuk first slice;
- [ ] finalisasi error envelope;
- [ ] finalisasi principal/auth context;
- [ ] finalisasi Node document-processing manifest;
- [ ] finalisasi job idempotency key dan retry matrix.

### C. Bootstrap Go foundation

- [ ] buat `apps/api-go`;
- [ ] buat `cmd/api` dan `cmd/worker`;
- [ ] pasang config, `chi`, OpenAPI generation, dan validation;
- [ ] pasang `pgxpool`, health/readiness, dan graceful shutdown;
- [ ] pasang logging, tracing, metrics, dan Sentry;
- [ ] pasang CI checks.

### D. Jalankan first vertical slice

- [ ] implement read-only endpoint;
- [ ] jalankan contract comparison dengan API lama;
- [ ] implement `artifact-cleanup` setelah read-only slice stabil;
- [ ] uji duplicate delivery dan rollback;
- [ ] cutover internal terlebih dahulu.

## 17. Definition of done untuk migrasi

Migrasi capability dianggap selesai jika:

- Go menjadi owner tunggal capability tersebut;
- API dan internal contract terdokumentasi;
- business rule tidak lagi terduplikasi;
- database dan queue ownership jelas;
- tenant isolation teruji;
- retry, idempotency, dan failure behavior teruji;
- observability tersedia;
- deployment dan rollback tervalidasi;
- runtime lama tidak lagi menerima traffic atau job untuk capability tersebut;
- dokumentasi ownership dan operational runbook diperbarui.

Tidak ada target untuk menghapus seluruh TypeScript worker atau Mastra agent. Targetnya adalah ownership yang jelas dan pemindahan capability yang terbukti aman.
