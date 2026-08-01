# Aqsha Go Migration — Architecture and Stack Specification

Status: proposed architecture
Date: 2026-08-01
Scope: Aqsha monorepo pada branch aqsha-svelte-migration

Dokumen ini mendefinisikan arah migrasi backend dan worker Aqsha menuju Go. Dokumen ini adalah specification dan decision record awal; belum mengubah runtime, database schema, queue, atau deployment.

## 1. Executive decision

Aqsha tidak dimigrasikan menjadi satu runtime Go penuh. Target yang dipilih adalah **modular monolith Go sebagai transactional core**, dengan Node tetap sebagai runtime agent, streaming, dan document processing selama fase migrasi.

~~~text
Svelte web
├── OpenAPI TypeScript client ──> Go API
└── Mastra client ──────────────> Node/Mastra streaming server

Go
├── API, auth, domain, database access
├── transactional orchestration
├── River workers
└── deterministic core processing

Node / apps/agent
├── Mastra agent
├── LLM streaming dan AI SDK streaming
└── document worker: extraction, OCR, citation, RAG sementara

Python / Daytona
└── statistical analysis, prioritas terakhir
~~~

Keputusan utama:

1. Mastra, AI SDK, agent workflow, dan semua LLM streaming tetap TypeScript.
2. apps/agent menjadi package yang memiliki Mastra server dan Node document worker, tetapi keduanya tetap process terpisah.
3. Extraction, OCR, citation processing, dan RAG boleh tetap Node terlebih dahulu.
4. RAG adalah kandidat paling baik untuk dipindahkan ke Go kemudian karena tidak inheren terhadap Mastra.
5. Go menggunakan net/http + chi, OpenAPI 3.0.3 + oapi-codegen, pgx/v5 + pgxpool, sqlc, River, Redis, dan S3-compatible storage.
6. BullMQ tetap dipakai oleh Node worker selama queue tersebut masih dimiliki Node.
7. River hanya digunakan untuk job yang sudah dimiliki Go.
8. Drizzle tetap menjadi migration owner selama schema masih dipakai bersama oleh TypeScript dan Go.
9. Python/Daytona hanya disiapkan sebagai capability boundary; implementasinya dilakukan terakhir.

## 2. Current repository context

Arsitektur target harus menghormati kondisi Aqsha saat ini, bukan mengasumsikan greenfield.

### Runtime saat ini

- apps/api adalah Bun/Elysia REST API dengan Clerk auth, billing/webhooks, dan BullMQ worker runtime.
- apps/agent adalah Node >=24 dengan Mastra, AI SDK, memory, PostgreSQL integration, Langfuse, dan Sentry.
- packages/db memiliki schema dan migrations Drizzle untuk PostgreSQL + pgvector.
- packages/services adalah domain/service layer yang dipakai API, worker, dan agent.
- apps/web mengonsumsi API melalui Eden Treaty dan mengonsumsi streaming agent melalui Mastra client.
- infra/compose.dev.yaml menyediakan PostgreSQL pgvector, Redis, dan MinIO.

### Repository pointers

- [apps/agent/package.json](../../apps/agent/package.json)
- [apps/api/src/workers/index.ts](../../apps/api/src/workers/index.ts)
- [packages/services/src/clients/queue.ts](../../packages/services/src/clients/queue.ts)
- [packages/services/src/artifacts/extract.ts](../../packages/services/src/artifacts/extract.ts)
- [packages/services/src/artifacts/extract-pipeline.ts](../../packages/services/src/artifacts/extract-pipeline.ts)
- [packages/services/src/rag.service.ts](../../packages/services/src/rag.service.ts)
- [infra/compose.dev.yaml](../../infra/compose.dev.yaml)

### Current queues

| Queue | Current owner | Karakter |
|---|---|---|
| artifact-cleanup | BullMQ worker | deterministic, cocok menjadi worker Go pertama |
| url-ingestion | BullMQ worker | download eksternal + extraction + enrichment |
| artifact-indexing | BullMQ worker | extraction + RAG indexing |
| paper-enrichment | BullMQ worker | external metadata + AI/provider work |
| library-ingest | BullMQ worker | metadata, open-access PDF, extraction, embedding |
| feed-hydration | BullMQ worker | scheduled external API work |
| thread-title | BullMQ worker | LLM-related, tetap Node |
| account-deletion | BullMQ worker | transactional deletion + blob sweep |
| integration-sync | BullMQ worker | external provider sync |

Current worker runtime memiliki retry exponential, stable jobId, terminal-failure Sentry reporting, queue-specific concurrency, repeatable feed hydration setiap tiga jam, dan graceful shutdown. Semantics ini harus dipertahankan ketika sebuah job dipindahkan ke Go.

### Current document and RAG behavior

Document extraction dan fallback OCR saat ini berada di packages/services/src/artifacts/extract.ts:

- PDF text layer menggunakan unpdf.
- Scanned PDF fallback ke Mistral OCR.
- DOCX menggunakan mammoth.
- XLSX menggunakan exceljs dengan preview rows/columns yang dibatasi.
- Image menggunakan Mistral OCR.
- Text/HTML menggunakan UTF-8 normalization dan HTML stripping.

Extraction pipeline masih menggabungkan beberapa tahap: membaca object storage, extraction, RAG indexing, optional text offload, lalu patch metadata dan extraction state secara transactional.

RAG saat ini mencakup:

- chunk size sekitar 2.000 karakter dengan overlap 200;
- embedding OpenAI-compatible dengan dimension yang dikonfigurasi tetap;
- upsert ke pgvector;
- vector search dan lexical search;
- Reciprocal Rank Fusion;
- scoping berdasarkan owner, thread, workspace, artifact, dan citation.

Karena extraction dan RAG masih tightly coupled, keduanya tidak boleh langsung dipecah menjadi beberapa runtime tanpa contract, idempotency, dan regression corpus.

## 3. Goals and non-goals

### Goals

- Memiliki API dan worker Go yang type-safe, explicit, mudah dites, dan tidak bergantung pada Mastra.
- Memisahkan interactive streaming workload dari background document workload.
- Mempertahankan PostgreSQL, pgvector, MinIO/R2, Clerk, dan observability yang sudah menjadi bagian Aqsha.
- Memindahkan domain dan transactional ownership secara bertahap per capability.
- Mempertahankan behavior, error contract, retry semantics, dan tenant isolation.
- Menghindari duplikasi business logic antara Go dan packages/services lebih dari masa transisi.

### Non-goals

- Memindahkan Mastra agent ke Go.
- Mengimplementasikan LLM streaming di Go.
- Mengganti Mastra client pada frontend.
- Mengimplementasikan Python/Daytona pada fase awal.
- Mengganti PostgreSQL dengan database lain.
- Mengganti River dan BullMQ secara global dalam satu fase.
- Membuat microservices terpisah untuk setiap domain.
- Membuat ORM Go untuk menggantikan SQL eksplisit.

## 4. Runtime ownership

### Go API

Go API menjadi owner target untuk:

- Clerk authentication boundary dan verified principal mapping;
- user, workspace, membership, permission, dan tenant authorization;
- artifact metadata, lifecycle, processing state, dan deletion state;
- billing command/webhook boundary ketika sudah dimigrasikan;
- signed upload/download URL dan object metadata;
- API read/write yang deterministic;
- transactional enqueue untuk job Go melalui River;
- internal contracts untuk Node document processing;
- stable application error contract.

Go API tidak menjadi owner untuk LLM stream. Endpoint yang menggunakan streamText, Mastra agent, /deep, atau Mastra-specific response protocol tetap berada di Node.

### Go worker

Go worker menjadi owner untuk job yang:

- mengubah state database secara transactional;
- tidak memerlukan Mastra runtime;
- memiliki retry dan idempotency yang dapat didefinisikan dengan jelas;
- tidak membutuhkan library document yang lebih matang di Node;
- dapat dibatasi concurrency dan resource-nya.

Contoh awal:

- artifact cleanup;
- artifact lifecycle reconciliation;
- object metadata reconciliation;
- deletion orchestration setelah contract stabil;
- deterministic metadata/index commit;
- scheduled housekeeping;
- orchestration untuk Node document processing.

### Node agent server

apps/agent tetap memiliki:

- Mastra agent;
- /deep workflow;
- memory dan agent tools;
- LLM streaming;
- AI SDK streaming;
- Langfuse dan agent-specific observability;
- response format yang dikonsumsi Mastra client.

### Node document worker

apps/agent juga menjadi package untuk Node worker process terpisah yang menangani:

- PDF/DOCX/XLSX extraction pada fase awal;
- OCR provider orchestration;
- LLM-based citation extraction;
- AI enrichment yang bergantung pada prompt, tool, memory, atau Mastra;
- RAG extraction/indexing sementara;
- BullMQ queues yang belum dimiliki Go.

Package boleh sama, tetapi process harus berbeda. Worker berat tidak boleh dijalankan di process Mastra server karena memory pressure, restart, concurrency, dan scaling profile-nya berbeda.

### Python/Daytona

Python/Daytona bukan bagian dari baseline migration. Ketika dibutuhkan, Go membuat analysis_run, menyimpan input manifest di MinIO/R2, mengirim job ke Daytona, lalu memvalidasi result artifact sebelum commit ke PostgreSQL.

Python tidak mendapatkan akses langsung ke database production.

## 5. Target topology

~~~text
                           ┌────────────────────────────┐
                           │ Svelte web                  │
                           │                            │
                           │ OpenAPI TS client           │
                           │ Mastra client               │
                           └──────────────┬─────────────┘
                                          │
                 ┌────────────────────────┴────────────────────┐
                 │                                             │
                 ▼                                             ▼
       ┌─────────────────────┐                      ┌─────────────────────┐
       │ Go API              │                      │ Node/Mastra server   │
       │ REST/OpenAPI        │                      │ agent + /deep        │
       │ auth/domain         │                      │ LLM streaming        │
       │ transactions        │                      │ Mastra protocol      │
       └───────┬─────────────┘                      └──────────┬──────────┘
               │                                               │
               │                                               │ internal retrieval /
               │                                               │ processing contract
               ▼                                               ▼
       ┌─────────────────────┐                      ┌─────────────────────┐
       │ Go worker           │                      │ Node document worker │
       │ River jobs          │                      │ BullMQ jobs          │
       │ deterministic work  │                      │ extraction/OCR/RAG   │
       └───────┬─────────────┘                      └──────────┬──────────┘
               │                                               │
               └──────────────────┬────────────────────────────┘
                                  ▼
                    ┌────────────────────────────┐
                    │ PostgreSQL + pgvector       │
                    │ Redis                       │
                    │ MinIO/R2                    │
                    └────────────────────────────┘
~~~

Object storage dapat diakses oleh kedua runtime melalui S3-compatible adapter, tetapi database ownership harus per capability. Setelah Go mengambil alih sebuah capability, Node tidak boleh melakukan arbitrary writes ke tabel owner capability tersebut.

Pada masa transisi, packages/services boleh tetap memakai database untuk capability yang belum dimigrasikan. Boundary ini harus dicatat per capability.

## 6. Go architecture

Arsitektur Go yang dipilih adalah **modular monolith dengan thin ports-and-adapters boundary**.

Ini bukan Clean Architecture penuh dengan banyak layer kosong, dan bukan DDD berat. Setiap domain memiliki:

1. domain types dan invariants;
2. application/use-case methods;
3. consumer-side interfaces untuk dependency yang benar-benar dibutuhkan;
4. adapter HTTP, PostgreSQL, River, storage, atau external API;
5. tests yang memverifikasi behavior.

### Proposed module layout

Selama apps/api Bun masih hidup, Go dapat dimulai sebagai module paralel:

~~~text
apps/api-go/
├── go.mod
├── go.sum
├── cmd/
│   ├── api/
│   │   └── main.go
│   └── worker/
│       └── main.go
├── internal/
│   ├── app/
│   │   ├── api.go
│   │   └── worker.go
│   ├── config/
│   ├── auth/
│   ├── httpapi/
│   │   ├── generated/
│   │   ├── middleware/
│   │   ├── handlers/
│   │   └── errors/
│   ├── postgres/
│   │   ├── generated/
│   │   ├── queries/
│   │   └── pool.go
│   ├── artifact/
│   ├── workspace/
│   ├── library/
│   ├── paper/
│   ├── billing/
│   ├── processing/
│   ├── jobs/
│   ├── objectstore/
│   ├── retrieval/
│   └── observability/
├── openapi/
│   ├── aqsha.yaml
│   ├── generated.go.yaml
│   └── config.yaml
├── queries/
│   ├── artifact.sql
│   ├── workspace.sql
│   └── processing.sql
├── testdata/
└── .golangci.yml
~~~

cmd/* hanya melakukan config loading, dependency wiring, lifecycle, dan Run(). Business logic berada di internal/.

Tidak perlu pkg/ sampai ada library yang benar-benar dimaksudkan untuk dikonsumsi module eksternal. Tidak perlu go.work selama hanya ada satu Go module.

### Composition root and dependency injection

Gunakan manual constructor injection pada fase awal:

~~~text
cmd/api/main.go
├── LoadConfig
├── NewLogger
├── NewTracerProvider
├── NewPostgresPool
├── NewClerkVerifier
├── NewObjectStore
├── NewArtifactService
├── NewWorkspaceService
├── NewHTTPServer
└── Run
~~~

Jangan menggunakan global registry, package-level service locator, atau init() untuk membuka database dan client external.

DI library seperti wire, fx, atau samber/do belum diperlukan. Pertimbangkan kembali hanya ketika jumlah service dan lifecycle hook sudah membuat manual wiring sulit direview.

### Package rules

- Package name lowercase dan singular.
- Interface didefinisikan oleh consumer, bukan implementer.
- Interface kecil, biasanya 1–3 method.
- Constructor menerima interface jika memang ada kebutuhan substitution/test.
- Constructor mengembalikan concrete type.
- Domain tidak mengimpor chi, River, Clerk SDK, atau driver database.
- context.Context menjadi parameter pertama dan tidak disimpan di struct.
- Semua resource yang dibuka memiliki lifecycle yang jelas.
- Tidak memakai generic package seperti utils, helpers, atau common tanpa domain yang spesifik.

## 7. API and contract strategy

### OpenAPI

Gunakan OpenAPI 3.0.3 sebagai contract source untuk Go API dan client TypeScript.

oapi-codegen menyediakan chi-server dan strict-server, tetapi official documentation menyatakan dukungan resmi masih berfokus pada OpenAPI 3.0; OpenAPI 3.1 belum didukung resmi. Karena itu OpenAPI 3.0.3 lebih tepat untuk baseline ini.

Konfigurasi yang disarankan:

~~~yaml
package: api
generate:
  models: true
  chi-server: true
  strict-server: true
output: internal/httpapi/generated/server.gen.go
~~~

Tambahkan request validation middleware secara eksplisit. Generated server tidak otomatis melakukan authentication dan authorization.

### Frontend client

Saat ini apps/web bergantung pada Eden Treaty dan API App type dari Elysia. Ketika public API berpindah ke Go:

~~~text
Elysia App type  ──> OpenAPI schema  ──> generated TypeScript client
~~~

Mastra client tetap terpisah dan tidak diganti oleh OpenAPI client.

Generated API client harus memiliki:

- typed request/response models;
- typed error envelope;
- auth header injection;
- request cancellation;
- stable endpoint operation IDs;
- contract tests terhadap Go API.

### Error contract

Go API harus mempertahankan shape error yang sudah dipahami frontend:

~~~json
{
  "message": "human-readable message",
  "code": "stable_machine_code",
  "severity": "error",
  "field": "optional_field"
}
~~~

Technical error detail hanya masuk ke structured logs, Sentry, dan trace.

### Authentication and authorization

Clerk middleware bertugas:

1. membaca bearer token;
2. memverifikasi signature dan claims;
3. menghasilkan verified principal;
4. meneruskan principal melalui request context.

Authorization tetap menjadi tanggung jawab domain service dan query scope. Jangan menganggap ownerUserId, workspaceId, atau role dari request body sebagai trusted identity.

Semua query tenant-scoped harus mengikat owner/workspace scope di SQL.

## 8. Library catalogue and decisions

### Baseline dependencies

| Area | Recommended | Decision |
|---|---|---|
| Runtime | Go 1.26.x | Pin di go.mod dan CI image yang sama |
| HTTP server | net/http + github.com/go-chi/chi/v5 | Idiomatic dan cocok dengan generated handler |
| API codegen | github.com/oapi-codegen/oapi-codegen/v2 | strict server + chi server |
| Request validation | github.com/oapi-codegen/nethttp-middleware | Validasi request dari OpenAPI spec |
| JSON | encoding/json | Standard library cukup |
| PostgreSQL | github.com/jackc/pgx/v5 | PostgreSQL-native dan context-aware |
| Pool | pgxpool | Satu pool per process dengan budget eksplisit |
| SQL generation | sqlc | SQL eksplisit dan compiler-checked |
| Vector | github.com/pgvector/pgvector-go/pgx | Saat Go mengambil alih vector write/search |
| Queue | github.com/riverqueue/river + riverpgxv5 | Hanya job owner Go |
| Redis | github.com/redis/go-redis/v9 | Cache, lock, rate limit, legacy queue boundary |
| Object storage | AWS SDK for Go v2 | S3, MinIO, dan R2 melalui adapter |
| Auth | github.com/clerk/clerk-sdk-go/v2 | Clerk backend integration |
| Logging | log/slog | JSON structured logs ke stdout |
| Tracing/metrics | go.opentelemetry.io/otel | OTLP ke collector/backend |
| HTTP tracing | OTel otelhttp | Inbound/outbound HTTP spans |
| Error reporting | github.com/getsentry/sentry-go | Exception reporting dan release context |
| Rate limit | golang.org/x/time/rate | Local limiter; Redis untuk distributed limiter |
| Tests | testing, httptest | Standard library first |
| Leak detection | go.uber.org/goleak | Worker/concurrent package |
| Lint | golangci-lint | CI gate |
| Security | govulncheck | Dependency reachability scan |

### Dependencies yang tidak dipakai pada baseline

- GORM, Ent, atau ORM lain: query visibility dan PostgreSQL-specific behavior lebih penting.
- Fiber: net/http + chi lebih cocok untuk OpenAPI, OTel, dan standard middleware.
- Viper: config Aqsha tidak membutuhkan layered config system pada fase awal.
- fx, dig, wire, atau samber/do: manual wiring lebih mudah direview saat module masih baru.
- Resty: net/http dengan typed client, timeout, dan context sudah cukup.
- Asynq: tidak diperlukan sebagai alternatif kedua; jangan menambah queue model baru.
- Temporal: bukan baseline; gunakan hanya jika muncul workflow long-running dengan pause/resume atau human approval.
- NATS/Kafka: belum ada kebutuhan event streaming durable yang membenarkan operational cost.

### Document library policy

Document processing tidak dipindah ke Go hanya karena Go menjadi backend utama.

Kandidat Go:

- text, HTML, CSV, JSON normalization dengan standard library;
- XLSX preview dengan excelize;
- chunking, normalization, size cap, dan checksum;
- embedding client dan pgvector indexing;
- deterministic citation parsing.

Tetap Node terlebih dahulu:

- PDF extraction yang membutuhkan behavior setara unpdf;
- DOCX extraction yang membutuhkan behavior setara mammoth;
- OCR orchestration yang memakai Mistral dan format payload existing;
- citation extraction yang membutuhkan LLM;
- AI enrichment yang memakai Mastra tools, memory, atau workflow.

Sebelum memindahkan PDF/DOCX ke Go, siapkan corpus regression berisi dokumen nyata Aqsha dan bandingkan extracted text, markdown output, page boundary, Unicode normalization, tables, empty/scanned detection, memory, execution time, dan error classification.

## 9. Database strategy

### Access pattern

Gunakan pgx/v5 dan sqlc, bukan ORM.

Aturan wajib:

- semua query memakai parameterized placeholders;
- semua operasi database menerima context;
- not-found error diterjemahkan ke domain error;
- rows selalu di-close dan error iterasi diperiksa;
- multi-statement write menggunakan transaction;
- gunakan SELECT FOR UPDATE ketika row akan dimodifikasi;
- pool memiliki MaxConns, MinConns, MaxConnLifetime, dan MaxConnIdleTime yang eksplisit;
- query timeout untuk vector search dan bulk processing;
- batch insert digunakan untuk embeddings;
- tidak ada raw SQL dari request input.

### Connection budget

API dan worker adalah process berbeda. Masing-masing process memiliki pool sendiri:

~~~text
PostgreSQL max_connections
>= API pool
 + Go worker pool
 + Node agent/worker connections
 + migration/admin headroom
 + observability/admin overhead
~~~

Vector search dan embedding indexer tidak boleh menghabiskan seluruh pool sampai API tidak bisa memperoleh connection.

### pgvector

Go dapat memiliki retrieval/indexing module sendiri:

~~~text
internal/retrieval/
├── chunk.go
├── embedding.go
├── index.go
├── search.go
└── scope.go
~~~

Dimension embedding, model name, distance metric, dan index strategy harus dianggap versioned contract. Jangan mengubah dimension tanpa migration dan reindex plan.

RAG indexing harus idempotent berdasarkan:

- artifactId;
- artifact content/version checksum;
- embedding model version;
- chunking profile version.

### Migration owner

Selama packages/db masih dipakai TypeScript:

~~~text
Drizzle schema + Drizzle migrations = owner
Go sqlc = consumer/query generator
~~~

Go tidak membuat migration terpisah untuk tabel yang masih dimiliki Drizzle.

Jika semua write ownership sudah pindah ke Go, pilih satu migration owner baru:

- Atlas jika membutuhkan schema inspection, linting, plan, dan drift detection;
- golang-migrate jika hanya membutuhkan versioned SQL yang sederhana dan explicit.

Jangan menjalankan Drizzle, Atlas, dan golang-migrate bersamaan terhadap schema yang sama.

## 10. Queue and worker strategy

### Queue ownership rule

~~~text
Capability owner Go   -> River/PostgreSQL
Capability owner Node -> BullMQ/Redis
~~~

River dan BullMQ tidak boleh memproses job yang sama atau menggunakan job name yang sama dengan semantics berbeda.

### Transitional queue model

1. Existing TypeScript producers tetap enqueue ke BullMQ.
2. Node worker di apps/agent dapat mengonsumsi document-related BullMQ queues.
3. Go tidak melakukan raw BullMQ enqueue dengan meniru internal job payload/Lua behavior.
4. Ketika Go menjadi orchestration owner, Go memakai River untuk lifecycle job.
5. River dapat memanggil Node processing contract secara idempotent, atau Node menerima submission melalui internal HTTP contract.

### Node document worker queues

Queue Node yang lebih tepat setelah worker dipindah ke apps/agent:

~~~text
document-extract
document-ocr
document-citation
document-rag-index
ai-enrichment
~~~

Jangan menggunakan satu job besar process-document jika failure pada tahap akhir akan mengulang semua tahap. Setiap stage harus memiliki input/output contract, idempotency key, timeout, retry policy, retryable/non-retryable classification, max payload, observability attributes, dan terminal failure state.

### Concurrency

| Stage | Initial concurrency | Alasan |
|---|---:|---|
| PDF/DOCX extraction | 1–2 | memory dan CPU bound |
| XLSX preview | 1–2 | malformed/sparse workbook dapat mahal |
| OCR | 1–2 | external provider rate limit dan payload besar |
| Embeddings | 2–4 | provider rate limit dan DB write pressure |
| RAG search | bounded by API pool | latency-sensitive |
| AI enrichment | provider-specific | token/rate budget |

Concurrency dinaikkan berdasarkan metrics dan benchmark. Setiap goroutine/job harus memiliki cancellation path dan graceful shutdown.

### Retry and idempotency

Retry tidak boleh menggandakan:

- artifact content row;
- extraction row;
- embedding chunks;
- citation row;
- external provider side effect.

Gunakan stable processing IDs, upsert/delete-old-then-insert semantics, dan unique constraint yang merepresentasikan invariant domain.

## 11. apps/agent target structure

apps/agent saat ini sudah Node >=24 dan memiliki Mastra, AI SDK, DB, services, Langfuse, serta Sentry dependencies. Package tersebut dapat menampung dua entrypoint tanpa membuat package baru.

~~~text
apps/agent/
├── package.json
├── src/
│   ├── mastra/
│   │   ├── agents/
│   │   ├── workflows/
│   │   ├── tools/
│   │   └── index.ts
│   ├── server/
│   │   └── main.ts
│   ├── worker/
│   │   ├── main.ts
│   │   ├── queues.ts
│   │   ├── lifecycle.ts
│   │   └── processors/
│   │       ├── document-extract.ts
│   │       ├── document-ocr.ts
│   │       ├── document-citation.ts
│   │       ├── document-rag-index.ts
│   │       └── ai-enrichment.ts
│   ├── document/
│   ├── citation/
│   ├── rag/
│   └── contracts/
├── scripts/
│   ├── gen-inline-skills.ts
│   └── worker.ts
└── tests/
~~~

Runtime commands target:

~~~bash
bun run dev:agent
bun run dev:agent-worker
~~~

Production deployment juga memisahkan health check, restart policy, resource limit, dan scaling antara agent server dan agent worker.

Node worker tidak boleh menginisialisasi Mastra server secara penuh jika hanya memerlukan extraction/OCR/RAG. Import Mastra agent, memory, dan streaming adapter harus berada di server/tool path yang benar-benar membutuhkannya.

## 12. Cross-runtime document contract

### Processing request

Go atau existing TypeScript producer mengirim logical request, bukan raw file bytes:

~~~json
{
  "processingRunId": "run_123",
  "artifactId": "artifact_123",
  "artifactVersion": 4,
  "objectKey": "users/u_123/artifacts/a_123/source.pdf",
  "fileName": "source.pdf",
  "mimeType": "application/pdf",
  "extractorProfile": "aqsha-document-v1",
  "requestedStages": ["extract", "ocr_if_needed", "rag_index"]
}
~~~

Object storage key harus tenant-scoped. Jika runtime berbeda network/security boundary, gunakan short-lived signed URL atau scoped service credentials.

### Processing result

Node worker mengembalikan manifest:

~~~json
{
  "processingRunId": "run_123",
  "artifactId": "artifact_123",
  "artifactVersion": 4,
  "status": "completed",
  "markdownKey": "users/u_123/artifacts/a_123/derived/v4/content.md",
  "plainTextKey": "users/u_123/artifacts/a_123/derived/v4/content.txt",
  "plainTextBytes": 18342,
  "extractorVersion": "node-document-v1",
  "warnings": ["ocr_not_required"],
  "completedStages": ["extract", "rag_index"]
}
~~~

Raw extracted text tidak perlu dikirim melalui internal HTTP jika ukurannya besar. Simpan di MinIO/R2 dan kirim key + checksum.

### Failure result

Failure harus membedakan:

- retryable_provider_error;
- retryable_storage_error;
- invalid_document;
- unsupported_format;
- document_too_large;
- ocr_disabled;
- embedding_disabled;
- permanent_processing_error.

Go dan Node harus menyepakati error code, bukan mencocokkan free-form error message.

## 13. RAG migration path

### Phase A — Node-owned RAG

Extraction dan RAG tetap berada di Node worker:

~~~text
Node worker
├── read MinIO/R2
├── extract
├── chunk
├── embed
├── write pgvector
└── patch current artifact state
~~~

Ini adalah pilihan paling aman untuk mempertahankan behavior saat API Go baru mulai dibangun.

### Phase B — Go-owned retrieval core

Setelah OpenAPI/internal contract stabil, Go mengambil alih:

~~~text
Node worker
└── normalized text manifest

Go worker
├── chunk profile
├── embedding client
├── pgvector write
├── lexical index
└── retrieval API
~~~

Mastra tool kemudian memanggil Go retrieval API untuk search. Mastra tetap mengontrol tool invocation dan streaming; Go mengontrol retrieval correctness dan data access.

### Phase C — Optional Go extraction

Pindahkan hanya format tertentu setelah regression corpus lulus:

- text/HTML/CSV/JSON terlebih dahulu;
- XLSX setelah preview equivalence diverifikasi;
- PDF/DOCX hanya jika output parity, memory, dan licensing library memadai;
- OCR tetap melalui provider API, bukan local OCR Go yang menambah operational complexity tanpa kebutuhan.

## 14. Observability

Gunakan:

- slog untuk JSON logs;
- OpenTelemetry untuk traces dan metrics;
- Sentry untuk exception/error event;
- OTel Collector atau compatible backend untuk export;
- Langfuse tetap untuk LLM token/cost trace pada agent.

Semua API request dan job span minimal membawa service name, service version, environment, request ID, trace ID, processing run ID, job name, attempt, dan queue name.

Jangan memakai full URL, email, raw document content, prompt, atau user ID sebagai high-cardinality metric label.

### Metrics minimum

API:

- request count;
- request duration histogram;
- error count by stable code;
- DB pool in-use/idle/wait duration;
- external API latency/error rate.

Workers:

- queue depth;
- active jobs;
- job duration;
- retries;
- terminal failures;
- document bytes processed;
- OCR usage;
- embedding batch size and latency;
- RAG index count;
- memory/GC and goroutine count untuk Go worker.

## 15. Security and data isolation

### API

- Verify Clerk token server-side.
- Derive identity from verified token, bukan request body.
- Enforce workspace/owner scope di setiap query.
- Verify webhook signature before parsing side effects.
- Preserve webhook idempotency key/event deduplication.
- Return generic user-facing errors.
- Set ReadTimeout, WriteTimeout, IdleTimeout, dan MaxHeaderBytes.

### Document processing

- Enforce maximum upload bytes sebelum membaca fully.
- Treat file name, MIME, dan extension sebagai untrusted.
- Avoid path construction dari raw user filename.
- Limit decompression dan workbook traversal.
- Use context timeout untuk storage, OCR, dan provider calls.
- Never log raw document content atau full signed URL.
- Use tenant-scoped object keys dan least-privilege storage credentials.
- Validate redirects dan private-network access untuk URL ingestion agar tidak menjadi SSRF.

### Cross-runtime calls

Internal Node/Go calls harus:

- authenticated service-to-service;
- memiliki request ID dan trace propagation;
- memiliki timeout;
- idempotent berdasarkan processingRunId;
- membatasi body size;
- tidak meneruskan client-supplied privilege claims.

### Python/Daytona

Daytona harus menerima input melalui manifest/signed object access. Jangan memberikan production database URL, Clerk secret, S3 root credentials, atau Redis password ke analysis environment.

## 16. Testing strategy

### Unit tests

Unit tests Go menggunakan standard testing:

- table-driven tests dengan named subtests;
- test error path dan cancellation;
- mock interface hanya pada external boundary;
- test pure domain logic tanpa PostgreSQL;
- test API response contract melalui httptest;
- test retry classification dan idempotency.

### Integration tests

Integration tests menggunakan PostgreSQL pgvector, Redis, dan MinIO nyata. Pisahkan dengan build tag integration:

~~~bash
go test ./...
go test -race ./...
go test -tags=integration ./...
~~~

Test cases minimum:

- tenant isolation;
- transaction rollback;
- duplicate processing request;
- retry setelah provider timeout;
- River enqueue hanya setelah transaction commit;
- vector dimension mismatch;
- reindex idempotency;
- artifact deletion dan object sweep;
- graceful worker shutdown;
- connection pool exhaustion behavior.

### Concurrency tests

Worker/concurrency packages menggunakan goleak bila memiliki goroutine lifecycle sendiri. Semua goroutine harus memiliki owner, cancellation path, dan wait mechanism. Jalankan race detector di CI.

### Document regression corpus

Sebelum migration extraction, siapkan fixture non-sensitive dengan kategori:

- born-digital PDF;
- scanned PDF;
- DOCX dengan heading/list/table;
- XLSX normal dan sparse;
- HTML dengan script/style;
- Unicode dan multilingual text;
- corrupt/truncated file;
- file besar;
- unsupported MIME spoof.

Bandingkan output normalized text, markdown, chunks, metadata, runtime, dan peak memory.

## 17. Migration phases

### Phase 0 — Contract and inventory

Deliverables:

- capability ownership matrix;
- API error contract;
- OpenAPI 3.0.3 baseline;
- Node document processing contract;
- job idempotency rules;
- database ownership matrix;
- current queue inventory.

Exit criteria:

- tidak ada endpoint yang belum jelas owner-nya;
- tidak ada job yang akan diproses dua runtime;
- generated client dapat diuji terhadap existing API behavior.

### Phase 1 — Go foundation

Deliverables:

- apps/api-go module;
- cmd/api dan cmd/worker;
- config loader;
- graceful shutdown;
- pgxpool health/readiness;
- Clerk verification;
- structured logs;
- OpenTelemetry;
- lint, test, race, dan govulncheck tooling.

Exit criteria:

- Go API dapat boot/fail fast tanpa dependency tersembunyi;
- health dan readiness membedakan process hidup dari dependency siap;
- shutdown menutup HTTP server, worker, pool, tracer, dan storage client dengan benar.

### Phase 2 — First vertical slice

Migrasikan satu capability read-only, lalu artifact-cleanup.

Exit criteria:

- producer/consumer ownership jelas;
- retry dan terminal failure equivalence;
- idempotency test lulus;
- no duplicate mutation;
- metrics tersedia;
- rollback ke existing runtime masih mungkin.

### Phase 3 — Node worker consolidation

Pindahkan document-related worker registration dari apps/api ke apps/agent sebagai worker process terpisah, tanpa memindahkan Mastra streaming ke worker.

Exit criteria:

- agent server dan document worker dapat restart/scale independently;
- queue handler tidak boot full Mastra runtime kecuali diperlukan;
- existing extraction/RAG regression corpus lulus;
- BullMQ producer/consumer tidak terduplikasi.

### Phase 4 — Go domain ownership

Pindahkan per capability:

1. artifact metadata/lifecycle;
2. workspace/read permissions;
3. object storage metadata;
4. cleanup/deletion orchestration;
5. billing/webhook boundary;
6. deterministic integration jobs.

Setiap slice harus memindahkan API, service, persistence rule, producer, consumer, tests, dan observability secara bersamaan.

### Phase 5 — Go retrieval core

Pindahkan chunking, embedding, pgvector write/search, dan hybrid retrieval ke Go setelah processing manifest dan ownership contract stabil.

Exit criteria:

- retrieval result parity terukur;
- embedding model/dimension/version tercatat;
- reindex/delete idempotent;
- Mastra tool dapat menggunakan internal retrieval contract;
- streaming behavior tidak berubah.

### Phase 6 — Optional document format migration

Pindahkan hanya format yang terbukti lebih baik di Go. Jangan memindahkan PDF/DOCX/OCR secara default.

### Phase 7 — Python/Daytona

Mulai hanya ketika ada use case statistical analysis yang konkret, schema result jelas, dan resource/security policy tersedia.

## 18. Operational rules

### Deployment units

~~~text
go-api
go-worker
node-agent
node-agent-worker
web
~~~

Pada fase awal, go-api dapat berjalan sebagai internal/shadow API sampai contract dan frontend cutover siap.

### Environment variables

Kategori env Go:

~~~text
APP_ENV
APP_VERSION
HTTP_ADDR
DATABASE_URL
DATABASE_MAX_CONNS
DATABASE_MIN_CONNS
REDIS_URL
S3_ENDPOINT
S3_REGION
S3_BUCKET
S3_ACCESS_KEY_ID
S3_SECRET_ACCESS_KEY
S3_FORCE_PATH_STYLE
CLERK_SECRET_KEY
CLERK_JWT_KEY atau JWKS configuration
OTEL_EXPORTER_OTLP_ENDPOINT
SENTRY_DSN
~~~

Nama final harus diselaraskan dengan env yang sudah dipakai monorepo agar tidak ada dua nama untuk secret yang sama.

### Dependency hygiene

- Commit go.mod dan go.sum.
- Gunakan tool directives untuk pinned CLI tools pada Go 1.24+.
- Jalankan go mod tidy setelah dependency change.
- Jalankan go mod verify dan govulncheck sebelum release.
- Upgrade dependency secara deliberate.
- Review license, maintenance, importers, dan known vulnerabilities sebelum library menjadi baseline.

## 19. Risk register

| Risk | Dampak | Mitigasi |
|---|---|---|
| Duplicate domain logic Go/TS | state diverges | capability ownership matrix + vertical slice migration |
| Eden Treaty breakage | frontend integration failure | OpenAPI generated TS client + contract tests |
| Go direct BullMQ integration | jobs silently incompatible | Node owns BullMQ; Go uses River/internal contract |
| RAG vector dimension drift | search/index failure | versioned embedding profile + reindex plan |
| Node worker shares Mastra process | stream latency/crash | separate process, same package |
| Document retry duplicates rows | data duplication | processing IDs, unique constraints, idempotent upsert |
| OCR/provider throttling | queue backlog | bounded concurrency, timeout, backoff, metrics |
| PostgreSQL pool exhaustion | API outage | explicit connection budget and worker limits |
| Tenant scope omitted in Go query | data leak | consumer-side scope parameters + integration tests |
| Large/malformed document | OOM/worker crash | byte limits, bounded parsing, memory metrics |
| Migration ownership collision | schema drift | Drizzle remains sole owner until formal handoff |
| Python receives production credentials | data breach | object manifest only, isolated Daytona credentials |

## 20. Open decisions before implementation

Keputusan berikut harus diselesaikan sebelum Go API mulai mengambil public write ownership:

1. Repository/module path final untuk apps/api-go.
2. Apakah OpenAPI spec dibuat dari contract baru atau diekstrak bertahap dari Elysia routes.
3. Generated TypeScript client tool yang akan menggantikan Eden untuk route Go.
4. Exact Clerk JWT/JWKS verification mode untuk Go.
5. Capability pertama selain health/read-only endpoint.
6. Node processing contract: internal HTTP, River-dispatched request, atau event/outbox.
7. Artifact processing state machine dan schema ownership.
8. Embedding profile version dan pgvector dimension policy.
9. PostgreSQL connection budget per process.
10. Sentry/OTel export topology dan PII policy.

## 21. Reference links

### Repository references

- [apps/agent/package.json](../../apps/agent/package.json)
- [apps/api/src/workers/index.ts](../../apps/api/src/workers/index.ts)
- [packages/services/src/clients/queue.ts](../../packages/services/src/clients/queue.ts)
- [packages/services/src/artifacts/extract.ts](../../packages/services/src/artifacts/extract.ts)
- [packages/services/src/artifacts/extract-pipeline.ts](../../packages/services/src/artifacts/extract-pipeline.ts)
- [packages/services/src/rag.service.ts](../../packages/services/src/rag.service.ts)
- [infra/compose.dev.yaml](../../infra/compose.dev.yaml)

### Official ecosystem references

- [Go module layout](https://go.dev/doc/modules/layout)
- [Go security best practices](https://go.dev/doc/security/best-practices)
- [chi](https://github.com/go-chi/chi)
- [oapi-codegen](https://github.com/oapi-codegen/oapi-codegen)
- [sqlc PostgreSQL tutorial](https://docs.sqlc.dev/en/latest/tutorials/getting-started-postgresql.html)
- [pgx](https://github.com/jackc/pgx)
- [pgvector-go](https://github.com/pgvector/pgvector-go)
- [River](https://riverqueue.com/)
- [AWS SDK for Go v2](https://docs.aws.amazon.com/sdk-for-go/v2/developer-guide/welcome.html)
- [Clerk Go SDK](https://clerk.com/docs/reference/go/overview)
- [OpenTelemetry Go](https://opentelemetry.io/docs/languages/go/)
- [OpenTelemetry Go instrumentation](https://opentelemetry.io/docs/languages/go/libraries/)

## 22. Definition of ready for Go implementation

Go implementation baru boleh dimulai ketika slice yang dipilih memiliki:

- owner runtime yang eksplisit;
- request/response atau job contract;
- error code dan retry semantics;
- database query dan transaction boundary;
- authorization scope;
- migration ownership;
- idempotency key;
- timeout dan cancellation policy;
- metrics dan traces;
- unit/integration test plan;
- rollback atau coexistence plan.

Jika salah satu elemen tersebut belum ada, pekerjaan masih berada pada tahap architecture/contract design, bukan tahap coding.
