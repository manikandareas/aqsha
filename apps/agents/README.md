# Astra Agents

`apps/agents` adalah aplikasi Python untuk agen AI di Aqsha. Aplikasi ini menggunakan [Pydantic AI](https://ai.pydantic.dev/) sebagai framework agent, FastAPI sebagai server HTTP internal, dan `VercelAIAdapter` sebagai jembatan agar agent Python bisa dipakai dari UI/chat berbasis Vercel AI SDK.

Tujuan utamanya adalah menyediakan fondasi multi-agent yang tetap sederhana: satu orchestrator mengendalikan alur kerja, mendelegasikan tugas ke agen spesialis melalui Pydantic AI tools, lalu mengembalikan hasil yang terstruktur.

## Ringkasan Arsitektur

Astra memakai pola **DeepAgent-style orchestration**:

1. User atau caller mengirim brief/prompt.
2. `orchestrator` menerima task utama dan tetap menjadi pengendali alur.
3. Jika perlu, orchestrator memanggil agen spesialis sebagai tool:
   - `research` untuk discovery dan konteks.
   - `design` untuk rencana implementasi.
   - `review` untuk risiko dan validasi.
4. Output akhir dikembalikan sebagai model Pydantic `AstraPlan`.
5. Untuk chat UI, FastAPI menerima request internal dan meneruskannya ke `chat_agent` melalui `VercelAIAdapter`.

```text
Caller / CLI / Web app
        │
        ├── CLI: astra "task brief"
        │       │
        │       ▼
        │   Astra Orchestrator
        │       ├── Researcher agent
        │       ├── Architect agent
        │       └── Reviewer agent
        │
        └── HTTP: POST /internal/chat
                │
                ▼
            FastAPI server
                │
                ▼
            VercelAIAdapter
                │
                ▼
            Chat agent
```

## Struktur Project

```text
apps/agents
├── AGENTS.md
├── README.md
├── pyproject.toml
├── uv.lock
├── src/astra
│   ├── __init__.py
│   ├── __main__.py
│   ├── cli.py
│   ├── deps.py
│   ├── server.py
│   ├── settings.py
│   ├── types.py
│   └── agents
│       ├── __init__.py
│       ├── architect.py
│       ├── chat.py
│       ├── orchestrator.py
│       ├── researcher.py
│       └── reviewer.py
└── tests
```

## Agen yang Tersedia

### 1. Astra Orchestrator

File: `src/astra/agents/orchestrator.py`

Agen utama untuk workflow multi-agent. Orchestrator bertanggung jawab untuk:

- menerima brief utama;
- menjaga kontrol task loop;
- mendelegasikan pekerjaan ke agen spesialis;
- menyintesis hasil dari specialist agents;
- mengembalikan output terstruktur berupa `AstraPlan`.

Orchestrator menggunakan `deps_type=AstraDeps` agar konteks runtime dikirim secara eksplisit, bukan melalui global state. Specialist agents dipanggil melalui tool Pydantic AI:

- `research(ctx, brief)` memanggil Researcher.
- `design(ctx, brief)` memanggil Architect.
- `review(ctx, brief)` memanggil Reviewer.

Setiap pemanggilan specialist meneruskan `deps=ctx.deps` dan `usage=ctx.usage`, sehingga konteks dan accounting usage tetap dibagikan dalam satu run.

### 2. Astra Researcher

File: `src/astra/agents/researcher.py`

Agen discovery yang fokus pada:

- fakta yang sudah diketahui;
- asumsi;
- konteks yang hilang;
- ketidakpastian;
- decision points sebelum eksekusi.

Output agen ini berupa teks ringkas yang kemudian digunakan orchestrator sebagai bahan sintesis.

### 3. Astra Architect

File: `src/astra/agents/architect.py`

Agen perancang solusi yang mengubah konteks hasil riset menjadi rencana implementasi. Fokusnya adalah:

- langkah yang berurutan;
- desain minimal;
- boundary yang eksplisit;
- rencana yang bisa dieksekusi.

### 4. Astra Reviewer

File: `src/astra/agents/reviewer.py`

Agen reviewer yang melakukan stress-test terhadap rencana. Fokusnya adalah:

- correctness risk;
- edge cases;
- security concern;
- potensi regression;
- langkah validasi.

### 5. Chat Agent

File: `src/astra/agents/chat.py`

Agen percakapan untuk integrasi UI/chat. Berbeda dari orchestrator, `chat_agent` menghasilkan respons teks biasa dan dirancang untuk interaksi langsung dengan user melalui endpoint HTTP internal.

Instruksi utamanya adalah menjadi asisten Aqsha yang ringkas, thoughtful, dan praktis.

## Output Terstruktur

Workflow multi-agent utama mengembalikan `AstraPlan` dari `src/astra/types.py`:

```python
class AstraPlan(BaseModel):
    summary: str
    research: list[str]
    plan: list[str]
    risks: list[str]
    validation: list[str]
```

Struktur ini membuat hasil agent mudah dipakai oleh caller lain karena field-nya eksplisit:

- `summary`: ringkasan hasil task.
- `research`: fakta, asumsi, atau unknowns.
- `plan`: langkah implementasi/eksekusi.
- `risks`: risiko, edge cases, dan tradeoff.
- `validation`: checks untuk membuktikan hasil sudah benar.

## Runtime Dependencies

Shared dependency context ada di `src/astra/deps.py`:

```python
@dataclass(frozen=True)
class AstraDeps:
    user_id: str
    workspace: str
    constraints: tuple[str, ...] = ()
```

`AstraDeps` dikirim ke semua agent melalui `deps_type=AstraDeps`. Ini digunakan untuk menyertakan konteks runtime seperti user, workspace, dan constraint tanpa mengandalkan global mutable state.

## Konfigurasi

Settings dibaca dari environment dengan prefix `ASTRA_` melalui `src/astra/settings.py`.

Contoh `.env`:

```env
ASTRA_MODEL=openai:gpt-5.2
ASTRA_USER_ID=local-dev
ASTRA_WORKSPACE=aqsha
ASTRA_ENABLE_LOGFIRE=false
ASTRA_INTERNAL_TOKEN=replace-with-shared-secret
ASTRA_HTTP_HOST=127.0.0.1
ASTRA_HTTP_PORT=8001
OPENAI_API_KEY=
```

Variabel penting:

| Variable | Fungsi |
|---|---|
| `ASTRA_MODEL` | Model string Pydantic AI dengan prefix provider, misalnya `openai:gpt-5.2` atau `anthropic:claude-sonnet-4-6`. |
| `ASTRA_USER_ID` | Default user id untuk konteks lokal. |
| `ASTRA_WORKSPACE` | Workspace aktif. |
| `ASTRA_ENABLE_LOGFIRE` | Mengaktifkan observability Pydantic AI dengan Logfire. |
| `ASTRA_INTERNAL_TOKEN` | Bearer token untuk endpoint internal. Wajib untuk server HTTP. |
| `ASTRA_HTTP_HOST` | Host untuk server FastAPI. |
| `ASTRA_HTTP_PORT` | Port untuk server FastAPI. |

Provider API key mengikuti provider model yang dipakai. Contoh: jika memakai `openai:*`, isi `OPENAI_API_KEY`.

## Setup

```bash
cd apps/agents
uv sync --extra dev
cp .env.example .env
```

Jika ingin observability dengan Logfire:

```bash
uv sync --extra dev --extra observability
```

## Menjalankan Multi-Agent CLI

CLI menjalankan `Astra Orchestrator` dan mengembalikan `AstraPlan` dalam JSON.

```bash
uv run astra "Design a multi-agent research workflow for Aqsha"
```

Entry point CLI ada di `src/astra/cli.py` dan terdaftar di `pyproject.toml` sebagai:

```toml
[project.scripts]
astra = "astra.cli:main"
```

## Menjalankan API Server

Server HTTP memakai FastAPI dan endpoint internal untuk chat.

```bash
uv run astra-server
```

Atau langsung dengan uvicorn:

```bash
uv run uvicorn astra.server:app --host 127.0.0.1 --port 8001
```

Entry point server terdaftar sebagai:

```toml
[project.scripts]
astra-server = "astra.server:main"
```

## API Internal

### `POST /internal/chat`

Endpoint ini menerima request chat internal dan meneruskannya ke `VercelAIAdapter.dispatch_request()`.

Header:

| Header | Wajib | Fungsi |
|---|---:|---|
| `Authorization` | Ya | Format: `Bearer <ASTRA_INTERNAL_TOKEN>`. |
| `x-astra-user-id` | Tidak | Override `ASTRA_USER_ID` untuk request ini. |
| `x-astra-workspace` | Tidak | Override `ASTRA_WORKSPACE` untuk request ini. |
| `x-astra-model` | Tidak | Override model untuk request ini. |

Contoh request:

```bash
curl -X POST http://127.0.0.1:8001/internal/chat \
  -H "Authorization: Bearer replace-with-shared-secret" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Bantu buat rencana fitur journal."}]}'
```

Endpoint ini sengaja dibuat sebagai endpoint internal. Jika `ASTRA_INTERNAL_TOKEN` kosong, server akan mengembalikan error `500` karena token internal wajib dikonfigurasi.

## Vercel AI Adapter

Integrasi UI/chat dilakukan melalui:

```python
from pydantic_ai.ui.vercel_ai import VercelAIAdapter
```

Di `src/astra/server.py`, adapter dipakai seperti ini:

```python
return await VercelAIAdapter.dispatch_request(
    request,
    agent=chat_agent,
    sdk_version=6,
    deps=deps,
    model=x_astra_model or settings.model,
    manage_system_prompt="server",
)
```

Artinya:

- request dari client Vercel AI SDK diterima oleh FastAPI;
- format request/streaming ditangani oleh `VercelAIAdapter`;
- agent yang digunakan adalah `chat_agent`;
- model bisa dioverride per request melalui `x-astra-model`;
- system prompt dikelola di server, bukan dikirim dari client.

Dengan pola ini, UI TypeScript/React dapat tetap menggunakan Vercel AI SDK, sementara eksekusi agent tetap berada di service Python berbasis Pydantic AI.

## Observability

Observability opsional tersedia melalui Logfire. Jika `ASTRA_ENABLE_LOGFIRE=true`, CLI/server akan menjalankan:

```python
logfire.configure()
logfire.instrument_pydantic_ai()
```

Ini membantu tracing run agent, model request, dan tool call.

## Validasi

```bash
uv run ruff check .
uv run pyright
uv run pytest
```

## Catatan Pengembangan

- Gunakan model string dengan prefix provider, misalnya `openai:gpt-5.2`.
- Gunakan `deps_type=AstraDeps` untuk konteks runtime.
- Gunakan `@agent.tool` hanya untuk tool yang menerima `RunContext` sebagai argumen pertama.
- Untuk delegation multi-agent, panggil specialist agent dari tool orchestrator dan teruskan `usage=ctx.usage`.
- Unit test sebaiknya memakai `TestModel` atau `FunctionModel`, bukan provider model langsung.
