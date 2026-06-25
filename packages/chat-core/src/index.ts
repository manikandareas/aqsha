/**
 * @aqsha/chat-core — logika MURNI chat Astra (Fase 6), zero-dep & SATU FILE
 * (tanpa relative import).
 *
 * Kenapa paket sendiri: PROSES eve (`apps/web-v2/agent/*`) di-bundle Rolldown dan
 * TIDAK bisa mengonsumsi paket workspace TS-mentah dengan relative-import tanpa
 * ekstensi (`@aqsha/db`/`@aqsha/services`) — bundler-nya gagal resolve, dan runtime
 * Node tak bisa import `.ts` mentah bila di-externalize. Paket satu-file tanpa relative
 * import BISA di-bundle eve. Helper murni di sini dipakai BERSAMA oleh `agent/` (eve)
 * dan unit test (`test:v2`) → SATU SSOT, tanpa duplikasi.
 *
 * Tulisan tabel (raw SQL) tetap di `agent/lib/store.ts` (butuh driver `postgres`);
 * struktur tabel SSOT = `packages/db` (migrasi).
 */

/**
 * Principal hasil auth Clerk — STRUKTURAL identik `SessionAuthContext` eve tanpa
 * mengikat tipe eve.
 */
export type EvePrincipal = {
  principalId: string;
  principalType: string;
  authenticator: string;
  subject?: string;
  issuer?: string;
  attributes: Record<string, string>;
};

type ClerkClaims = {
  sub?: unknown;
  iss?: unknown;
  email?: unknown;
  org_id?: unknown;
};

/**
 * Map klaim token sesi Clerk → principal. `sub` (== `ownerUserId` V2) wajib; tanpa
 * `sub` → `null` (AuthFn skip → 401). `email` best-effort (bukan klaim token standar).
 */
export function clerkClaimsToPrincipal(claims: ClerkClaims): EvePrincipal | null {
  const sub = typeof claims.sub === "string" ? claims.sub : "";
  if (!sub) return null;
  const attributes: Record<string, string> = {};
  if (typeof claims.email === "string" && claims.email) attributes.email = claims.email;
  if (typeof claims.org_id === "string" && claims.org_id) attributes.orgId = claims.org_id;
  return {
    principalId: sub,
    principalType: "user",
    authenticator: "clerk",
    subject: sub,
    ...(typeof claims.iss === "string" && claims.iss ? { issuer: claims.iss } : {}),
    attributes,
  };
}

/**
 * Verdikt kepemilikan session→thread untuk `onMessage` (follow-up dengan sessionId).
 * - `not_found`: belum ada thread (lag proyeksi / first turn) → izinkan (hook create+own).
 * - `forbidden`: thread ada tapi owner ≠ caller → channel WAJIB tolak (403).
 * - `ok`: owner cocok.
 */
export function ownershipVerdict(
  thread: { ownerUserId: string } | null,
  callerPrincipalId: string,
): "ok" | "not_found" | "forbidden" {
  if (!thread) return "not_found";
  return thread.ownerUserId === callerPrincipalId ? "ok" : "forbidden";
}

const PREVIEW_MAX = 160;

/** Preview pesan untuk thread list — collapse whitespace + clamp 160 char (port V1). */
export function messagePreview(text: string): string {
  const flat = (text ?? "").replace(/\s+/g, " ").trim();
  const chars = Array.from(flat);
  if (chars.length <= PREVIEW_MAX) return flat;
  return `${chars.slice(0, PREVIEW_MAX - 1).join("")}…`;
}

/**
 * Id pesan DETERMINISTIK supaya proyeksi idempoten: step durable yang re-run saat
 * resume meng-upsert baris yang sama, bukan duplikat.
 */
export function userMessageId(sessionId: string, turnId: string): string {
  return `${sessionId}:${turnId}:user`;
}

/**
 * Key by `sequence` (event index, monotonik per turn), BUKAN `stepIndex`: satu turn
 * bisa emit >1 `message.completed` dengan stepIndex SAMA (teks → tool-call → teks dalam
 * satu step). `sequence` selalu distinct per event → tak tabrakan; dan stabil saat resume
 * durable (log replay sequence sama) → upsert idempoten.
 */
export function assistantMessageId(sessionId: string, turnId: string, sequence: number): string {
  return `${sessionId}:${turnId}:${sequence}:assistant`;
}

// ---------------------------------------------------------------------------
// Prompt commands (Slice 6.6) — SSOT dipindah dari packages/convex (V1) ke sini
// supaya client (web-v2) DAN eve bundle pakai data yang sama. Pure, zero-dep,
// tetap SATU FILE (constraint bundle eve). /deep di-DROP saat 6.6 (Lite-only),
// di-REAKTIFKAN Slice 7.0 (deep research): expand jadi instruksi pakai skill
// deep-research; gate billing/cap = `propose_research_plan` + send-status?feature.
// ---------------------------------------------------------------------------

/** Command id `/deep` (Slice 7.0) — dipakai composer untuk pre-check send-status deep-aware. */
export const DEEP_COMMAND_ID = "deep";

export type PromptCommand = {
  id: string;
  slug: string;
  label: string;
  description: string;
  group: "Tulis Akademik" | "Rancang Riset" | "Workspace";
  aliases: string[];
  keywords: string[];
  placeholder: string;
  buildPrompt: (argument: string) => string;
};

function withInput(argument: string, fallback: string) {
  const trimmed = argument.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

export const promptCommands = [
  {
    id: "paraphrase",
    slug: "/paraphrase",
    label: "Paraphrase akademik",
    description: "Tulis ulang teks Indonesia agar lebih akademik tanpa mengubah makna.",
    group: "Tulis Akademik",
    aliases: ["/parapharse"],
    keywords: ["parafrase", "paraphrase", "rewrite", "akademik", "indonesia"],
    placeholder: "Tempel paragraf yang ingin diparafrase...",
    buildPrompt: (argument) =>
      [
        "Parafrase teks berikut ke dalam bahasa Indonesia akademik yang jernih.",
        "Pertahankan makna, istilah penting, dan batas klaim. Jangan menambah fakta, sumber, atau kutipan baru.",
        "Jika teksnya ambigu, sebutkan bagian yang perlu diklarifikasi setelah versi parafrase.",
        "",
        withInput(argument, "[Teks belum diberikan]"),
      ].join("\n"),
  },
  {
    id: "expand",
    slug: "/expand",
    label: "Kembangkan ide",
    description: "Perluas paragraf atau gagasan dengan batas klaim yang eksplisit.",
    group: "Tulis Akademik",
    aliases: [],
    keywords: ["expand", "kembangkan", "elaborasi", "paragraph"],
    placeholder: "Tulis ide atau paragraf awal...",
    buildPrompt: (argument) =>
      [
        "Kembangkan gagasan berikut menjadi paragraf akademik yang lebih lengkap.",
        "Jangan mengarang klaim empiris, data, nama peneliti, atau sitasi. Tandai bagian yang membutuhkan sumber sebagai [perlu sumber].",
        "Jaga alur logis: konteks, argumen utama, implikasi, dan batasan.",
        "",
        withInput(argument, "[Gagasan belum diberikan]"),
      ].join("\n"),
  },
  {
    id: "summarize",
    slug: "/summarize",
    label: "Ringkas poin kunci",
    description: "Ringkas teks menjadi poin penting untuk tesis atau paper.",
    group: "Tulis Akademik",
    aliases: [],
    keywords: ["summarize", "ringkas", "summary", "poin", "tesis"],
    placeholder: "Tempel teks yang ingin diringkas...",
    buildPrompt: (argument) =>
      [
        "Ringkas teks berikut untuk kebutuhan tesis atau paper.",
        "Keluarkan poin kunci, argumen utama, istilah penting, celah/limitasi, dan pertanyaan lanjutan.",
        "Jangan memasukkan informasi yang tidak ada di teks.",
        "",
        withInput(argument, "[Teks belum diberikan]"),
      ].join("\n"),
  },
  {
    id: "outline",
    slug: "/outline",
    label: "Buat outline",
    description: "Susun kerangka tesis, paper, atau bagian bab.",
    group: "Rancang Riset",
    aliases: [],
    keywords: ["outline", "kerangka", "tesis", "paper", "bab"],
    placeholder: "Tulis topik, fokus, dan batasan...",
    buildPrompt: (argument) =>
      [
        "Buat outline akademik berdasarkan topik berikut.",
        "Susun struktur bagian dan subbagian, tujuan tiap bagian, serta catatan sumber yang dibutuhkan.",
        "Bedakan dengan jelas antara materi yang sudah bisa ditulis dan bagian yang masih membutuhkan bukti.",
        "",
        withInput(argument, "[Topik belum diberikan]"),
      ].join("\n"),
  },
  {
    id: "research-question",
    slug: "/research-question",
    label: "Rumusan masalah",
    description: "Turunkan rumusan masalah dan pertanyaan penelitian.",
    group: "Rancang Riset",
    aliases: ["/rq"],
    keywords: ["research question", "rumusan masalah", "pertanyaan penelitian", "rq"],
    placeholder: "Tulis topik dan konteks penelitian...",
    buildPrompt: (argument) =>
      [
        "Bantu merumuskan masalah penelitian dari konteks berikut.",
        "Berikan: latar masalah singkat, rumusan masalah, 3-5 pertanyaan penelitian, batasan penelitian, dan variabel/konsep kunci.",
        "Jangan membuat klaim faktual spesifik tanpa menandainya sebagai asumsi yang perlu diverifikasi.",
        "",
        withInput(argument, "[Konteks penelitian belum diberikan]"),
      ].join("\n"),
  },
  {
    id: "methodology",
    slug: "/methodology",
    label: "Struktur metodologi",
    description: "Sarankan struktur metode dan kebutuhan data.",
    group: "Rancang Riset",
    aliases: ["/method"],
    keywords: ["methodology", "metodologi", "metode", "data", "sampling"],
    placeholder: "Tulis topik, pertanyaan, dan konteks data...",
    buildPrompt: (argument) =>
      [
        "Rancang struktur metodologi untuk penelitian berikut.",
        "Berikan desain penelitian yang masuk akal, jenis data, teknik pengumpulan data, strategi analisis, validitas/keandalan, etika, dan risiko metodologis.",
        "Jika informasi kurang, tulis asumsi eksplisit dan daftar data yang masih diperlukan.",
        "",
        withInput(argument, "[Konteks metodologi belum diberikan]"),
      ].join("\n"),
  },
  {
    id: "literature-review",
    slug: "/literature-review",
    label: "Struktur tinjauan pustaka",
    description: "Rancang struktur literature review dan kebutuhan sitasi.",
    group: "Rancang Riset",
    aliases: ["/litreview"],
    keywords: ["literature review", "tinjauan pustaka", "kajian pustaka", "sitasi"],
    placeholder: "Tulis topik dan tradisi teori yang relevan...",
    buildPrompt: (argument) =>
      [
        "Buat struktur tinjauan pustaka untuk topik berikut.",
        "Susun tema utama, hubungan antar konsep, jenis sumber yang perlu dicari, kata kunci pencarian, dan celah riset potensial.",
        "Jangan membuat daftar sitasi palsu. Tandai setiap kebutuhan sitasi sebagai [perlu sumber].",
        "",
        withInput(argument, "[Topik tinjauan pustaka belum diberikan]"),
      ].join("\n"),
  },
  {
    id: "deep",
    slug: "/deep",
    label: "Deep research",
    description: "Riset mendalam multi-sumber: rencana, telaah literatur, bukti tandingan, sitasi terverifikasi.",
    group: "Rancang Riset",
    aliases: ["/deepresearch", "/riset"],
    keywords: ["deep", "deep research", "riset mendalam", "penelitian", "tinjauan", "verifikasi sitasi", "literatur"],
    placeholder: "Tulis pertanyaan riset yang ingin ditelusuri mendalam...",
    buildPrompt: (argument) =>
      [
        "Lakukan deep research untuk pertanyaan di bawah. Gunakan skill deep-research sebagai metodologi.",
        "WAJIB mulai dengan menyusun rencana riset lewat tool propose_research_plan (judul + 3-6 sub-pertanyaan) dan TUNGGU persetujuan user sebelum riset.",
        "Setelah disetujui: telaah literatur per sub-pertanyaan, cari bukti tandingan, verifikasi sitasi, lalu tulis jawaban tercitasi [n] yang menyebut kekuatan bukti dan keterbatasan. Hanya kutip sumber dari hasil tool; jangan mengarang identifier.",
        "",
        withInput(argument, "[Pertanyaan riset belum diberikan]"),
      ].join("\n"),
  },
  {
    id: "artifact",
    slug: "/artifact",
    label: "Kelola artifact workspace",
    description: "Buat, perbarui, atau hapus artifact workspace dengan konfirmasi.",
    group: "Workspace",
    aliases: [],
    keywords: ["artifact", "artefak", "dokumen", "workspace", "markdown"],
    placeholder: "Contoh: cerita rakyat, perbarui outline tesis, hapus draft lama...",
    buildPrompt: (argument) =>
      [
        "Jalankan perintah workspace artifact berikut menggunakan tool HITL — jangan tanya di chat biasa.",
        "WAJIB: create → ask_question dulu (1-2 pertanyaan), setelah user jawab → propose_artifact. Update → ask_question jika tidak jelas, else propose_artifact. Delete → delete_artifact.",
        "Jangan tulis daftar pilihan (1/2/3) di chat. Pakai ask_question untuk klarifikasi.",
        "Inferensi intent: buat/bikin/tulis/create = create; perbarui/update = update; hapus/delete = delete.",
        "propose_artifact: sertakan artifactType yang sesuai (markdown/plain_text/html/svg/mermaid/json/csv/code) dan planBullets (3-6 poin) tanpa isi final. Setelah user menyetujui, panggil execute_artifact sekali dengan konten final.",
        "Setelah memanggil tool HITL, balas maksimal satu kalimat singkat.",
        "",
        withInput(argument, "[Instruksi artifact belum diberikan]"),
      ].join("\n"),
  },
  {
    id: "workspace",
    slug: "/workspace",
    label: "Kelola workspace",
    description: "Buat atau rename workspace dengan konfirmasi.",
    group: "Workspace",
    aliases: [],
    keywords: ["workspace", "ruang kerja", "rename", "ganti nama", "buat workspace"],
    placeholder: "Contoh: buat workspace Tesis 2026, rename workspace Draft jadi Final...",
    buildPrompt: (argument) =>
      [
        "Jalankan permintaan manajemen workspace berikut menggunakan tool HITL — jangan tanya di chat biasa.",
        "WAJIB: buat workspace → ask_question jika nama/konteks belum jelas, lalu create_workspace. ganti nama → ask_question jika target tidak jelas, lalu rename_workspace.",
        "Setelah memanggil tool HITL, balas maksimal satu kalimat singkat.",
        "",
        withInput(argument, "[Instruksi workspace belum diberikan]"),
      ].join("\n"),
  },
] as const satisfies readonly PromptCommand[];

export type PromptCommandId = (typeof promptCommands)[number]["id"];

export function getPromptCommand(commandId: string | undefined | null): PromptCommand | null {
  if (!commandId) return null;
  return promptCommands.find((command) => command.id === commandId) ?? null;
}

export function buildPromptCommandPrompt(commandId: string, argument: string) {
  const command = getPromptCommand(commandId);
  if (!command) return null;
  return { command, expandedPrompt: command.buildPrompt(argument) };
}

/** All recognizable triggers for a command, longest first (alias-safe). */
function commandSlugs(command: PromptCommand): string[] {
  return [command.slug, ...command.aliases].sort((a, b) => b.length - a.length);
}

/** Match a leading slash command (slug or alias) at the start of `content`. */
export function matchPromptCommandInContent(content: string): PromptCommand | null {
  const trimmed = content.trim();
  return (
    promptCommands.find((command) =>
      commandSlugs(command).some(
        (slug) =>
          trimmed === slug || trimmed.startsWith(`${slug} `) || trimmed.startsWith(`${slug}\n`),
      ),
    ) ?? null
  );
}

/** Strip a leading command slug/alias, returning the remaining argument text. */
export function stripPromptCommandSlug(content: string, command: PromptCommand): string {
  const trimmed = content.trim();
  for (const slug of commandSlugs(command)) {
    if (trimmed === slug) return "";
    if (trimmed.startsWith(`${slug} `) || trimmed.startsWith(`${slug}\n`)) {
      return trimmed.slice(slug.length).trim();
    }
  }
  return trimmed;
}

/** Filter commands for the slash palette by typed query (slug/alias/label/keyword). */
export function filterPromptCommandsBySlashQuery(query: string): PromptCommand[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [...promptCommands];
  return promptCommands.filter((command) => {
    const candidates = [command.slug, ...command.aliases, command.label, ...command.keywords];
    return candidates.some((candidate) => {
      const lower = candidate.toLowerCase();
      const withoutSlash = lower.startsWith("/") ? lower.slice(1) : lower;
      return lower.includes(normalized) || withoutSlash.startsWith(normalized);
    });
  });
}

export type CommandDispatch = {
  /** What the user typed — stored as the message bubble text (single slug). */
  displayText: string;
  /** What the agent receives — expanded instruction (or the raw text). */
  dispatchPrompt: string;
};

/**
 * Split a composer turn into the friendly bubble text and the prompt dispatched
 * to the agent. A recognized command expands to its rich `buildPrompt`
 * instruction (so the model never sees a bare slash command). The slug is
 * stripped before building the argument, so it is never duplicated. /deep (Slice
 * 7.0) expands like any command — it tells the model to use the deep-research
 * skill; the billing/cap gate lives in `propose_research_plan`, not here.
 */
export function resolveCommandDispatch(content: string, commandId?: string | null): CommandDispatch {
  const displayText = content.trim();
  const command = getPromptCommand(commandId) ?? matchPromptCommandInContent(displayText);
  if (!command) return { displayText, dispatchPrompt: displayText };
  const argument = stripPromptCommandSlug(displayText, command);
  return { displayText, dispatchPrompt: command.buildPrompt(argument) };
}

// ---------------------------------------------------------------------------
// Context refs (Slice 6.6) — inline `@mention` pills (workspace / paper). Pure
// model dipindah dari apps/web (V1 lib/context-refs.ts) + mention markers
// (V1 packages/convex agent/context/mentionMarkers.ts) ke sini.
// ---------------------------------------------------------------------------

/** UX caps per percakapan (juga di-clamp ContextService.hydrate sisi server). */
export const MAX_CONTEXT_WORKSPACES = 5;
export const MAX_CONTEXT_PAPERS = 8;

export type ContextRef =
  | { kind: "workspace"; workspaceId: string; label: string }
  | { kind: "paper"; workspaceId: string; artifactId: string; label: string };

/** Stable identity for dedupe + signature comparison. */
export function contextRefKey(ref: ContextRef): string {
  return ref.kind === "paper" ? `${ref.workspaceId}:${ref.artifactId}` : `${ref.workspaceId}:`;
}

export function contextRefsSignature(refs: ContextRef[]): string {
  return refs.map(contextRefKey).join("|");
}

/** Split refs into the id lists the hydrate endpoint expects. */
export function splitContextRefs(refs: ContextRef[]): {
  workspaceIds: string[];
  artifactIds: string[];
} {
  const workspaceIds: string[] = [];
  const artifactIds: string[] = [];
  for (const ref of refs) {
    if (ref.kind === "workspace") workspaceIds.push(ref.workspaceId);
    else artifactIds.push(ref.artifactId);
  }
  return { workspaceIds, artifactIds };
}

export function countContextRefs(refs: ContextRef[]): { workspaces: number; papers: number } {
  let workspaces = 0;
  let papers = 0;
  for (const ref of refs) {
    if (ref.kind === "workspace") workspaces += 1;
    else papers += 1;
  }
  return { workspaces, papers };
}

export function buildWorkspaceMentionLabel(workspaceName: string): string {
  return `@${workspaceName}`;
}

export function buildPaperMentionLabel(workspaceName: string, paperTitle: string): string {
  return `@${workspaceName}:${paperTitle}`;
}

/** Inline mention markers (private-use sentinels) — keep pills inline in sent text. */
export const MENTION_MARKER_OPEN = String.fromCharCode(0xe000);
export const MENTION_MARKER_CLOSE = String.fromCharCode(0xe001);

export function wrapMentionLabel(label: string): string {
  return `${MENTION_MARKER_OPEN}${label}${MENTION_MARKER_CLOSE}`;
}

/** Remove inline mention markers, keeping the readable label inside. */
export function stripMentionMarkers(text: string): string {
  return text.split(MENTION_MARKER_OPEN).join("").split(MENTION_MARKER_CLOSE).join("");
}

export type MentionSegment =
  | { type: "text"; value: string }
  | { type: "mention"; label: string };

/** Split a message string into ordered text / mention segments. */
export function parseMentionSegments(text: string): MentionSegment[] {
  const segments: MentionSegment[] = [];
  let index = 0;
  while (index < text.length) {
    const open = text.indexOf(MENTION_MARKER_OPEN, index);
    if (open === -1) {
      if (index < text.length) segments.push({ type: "text", value: text.slice(index) });
      break;
    }
    if (open > index) segments.push({ type: "text", value: text.slice(index, open) });
    const close = text.indexOf(MENTION_MARKER_CLOSE, open + 1);
    if (close === -1) {
      segments.push({ type: "text", value: text.slice(open) });
      break;
    }
    segments.push({ type: "mention", label: text.slice(open + 1, close) });
    index = close + 1;
  }
  return segments;
}
