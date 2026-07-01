/**
 * @aqsha/chat-core — logika MURNI chat Astra (Fase 6), zero-dep & SATU FILE
 * (tanpa relative import).
 *
 * Kenapa paket sendiri: PROSES eve (`apps/web/agent/*`) di-bundle Rolldown dan
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

/**
 * Collapse whitespace + clamp ke `max` char (codepoint-safe via `Array.from`), tambah ellipsis bila
 * dipotong. Default `max` = 160 (preview thread list, port V1); pemanggil lain (mis. label pill
 * @mention) mengoper `max` lebih kecil. Satu util clamp bersama untuk web + agent.
 */
export function messagePreview(text: string, max: number = PREVIEW_MAX): string {
  const flat = (text ?? "").replace(/\s+/g, " ").trim();
  const chars = Array.from(flat);
  if (chars.length <= max) return flat;
  return `${chars.slice(0, max - 1).join("")}…`;
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
// supaya client (web) DAN eve bundle pakai data yang sama. Pure, zero-dep,
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
    // CATATAN: `/deep` dijalankan FE sebagai Workflow `deep-research` (lihat composer/use-mastra-agent),
    // jadi `buildPrompt` ini TAK dipakai untuk /deep. Disimpan sebagai fallback netral (tanpa tool
    // yang tak ada) seandainya dispatch chat biasa pernah menerimanya.
    buildPrompt: (argument) =>
      [
        "Lakukan riset mendalam untuk pertanyaan di bawah: susun rencana ringkas, telaah literatur,",
        "pertimbangkan bukti tandingan, lalu tulis jawaban tercitasi [n] yang menyebut kekuatan bukti",
        "dan keterbatasan. Hanya kutip sumber dari hasil tool; jangan mengarang identifier.",
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
        "WAJIB: create → ask_questions dulu (1-2 pertanyaan) jika belum jelas, setelah user jawab → propose_artifact. Update → ask_questions jika tidak jelas, else propose_artifact. Delete → delete_artifact.",
        "Jangan tulis daftar pilihan (1/2/3) sebagai teks di chat. Pakai ask_questions untuk klarifikasi.",
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
        "WAJIB: buat workspace → ask_questions jika nama/konteks belum jelas, lalu create_workspace. ganti nama → ask_questions jika target tidak jelas, lalu rename_workspace.",
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

/**
 * Tier agen Astra — kontrak bersama web + agent (FE selektor, route agent-scoped, billing, runtime
 * model/reasoning/memory). SATU definisi di sini; web (`mastra-client`/`ComposerAgentKind`) dan agent
 * (`tool-context`) mengimpornya, bukan menyalin union-nya.
 */
export type AgentKind = "lite" | "pro";

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
  | { kind: "paper"; workspaceId: string; artifactId: string; label: string }
  // Sumber Explore eksternal (BUKAN artifact workspace) — disematkan langsung dari halaman
  // baca paper/berita. Hydrate menariknya dari cache OpenAlex / feed (lihat ContextService).
  | { kind: "explore-paper"; paperKey: string; label: string }
  | { kind: "news"; feedItemId: string; label: string }
  // Pilihan blok di editor BlockNote (tombol "Tanya Astra" di Formatting Toolbar). Menyemat
  // blok spesifik sebuah artifact markdown + cuplikan teksnya supaya agen tahu bagian persis
  // yang dimaksud (baca via get_render_payload). Mengedit bagian = lewat AI editor native di dokumen.
  | {
      kind: "artifact-selection";
      artifactId: string;
      blockIds: string[];
      excerpt: string;
      label: string;
    };

/** Cuplikan pilihan blok editor untuk hydrate (validasi ownership + clamp di server). */
export type ContextSelection = {
  artifactId: string;
  blockIds: string[];
  excerpt: string;
};

/** Stable identity for dedupe + signature comparison. */
export function contextRefKey(ref: ContextRef): string {
  switch (ref.kind) {
    case "paper":
      return `${ref.workspaceId}:${ref.artifactId}`;
    case "workspace":
      return `${ref.workspaceId}:`;
    case "explore-paper":
      return `epk:${ref.paperKey}`;
    case "news":
      return `nid:${ref.feedItemId}`;
    case "artifact-selection":
      // Key by artifact + blok terurut → pilihan blok yang sama dedupe, pilihan berbeda distinct.
      return `asel:${ref.artifactId}:${[...ref.blockIds].sort().join(",")}`;
  }
}

export function contextRefsSignature(refs: ContextRef[]): string {
  return refs.map(contextRefKey).join("|");
}

/** Split refs into the id lists the hydrate endpoint expects. */
export function splitContextRefs(refs: ContextRef[]): {
  workspaceIds: string[];
  artifactIds: string[];
  paperKeys: string[];
  feedItemIds: string[];
  selections: ContextSelection[];
} {
  const workspaceIds: string[] = [];
  const artifactIds: string[] = [];
  const paperKeys: string[] = [];
  const feedItemIds: string[] = [];
  const selections: ContextSelection[] = [];
  for (const ref of refs) {
    switch (ref.kind) {
      case "workspace":
        workspaceIds.push(ref.workspaceId);
        break;
      case "paper":
        artifactIds.push(ref.artifactId);
        break;
      case "explore-paper":
        paperKeys.push(ref.paperKey);
        break;
      case "news":
        feedItemIds.push(ref.feedItemId);
        break;
      case "artifact-selection":
        selections.push({
          artifactId: ref.artifactId,
          blockIds: ref.blockIds,
          excerpt: ref.excerpt,
        });
        break;
      default: {
        // Exhaustiveness: menambah kind ContextRef baru jadi error compile di sini.
        const _exhaustive: never = ref;
        void _exhaustive;
      }
    }
  }
  return { workspaceIds, artifactIds, paperKeys, feedItemIds, selections };
}

export function countContextRefs(refs: ContextRef[]): {
  workspaces: number;
  papers: number;
  explorePapers: number;
  news: number;
  selections: number;
} {
  let workspaces = 0;
  let papers = 0;
  let explorePapers = 0;
  let news = 0;
  let selections = 0;
  for (const ref of refs) {
    switch (ref.kind) {
      case "workspace":
        workspaces += 1;
        break;
      case "paper":
        papers += 1;
        break;
      case "explore-paper":
        explorePapers += 1;
        break;
      case "news":
        news += 1;
        break;
      case "artifact-selection":
        selections += 1;
        break;
      default: {
        const _exhaustive: never = ref;
        void _exhaustive;
      }
    }
  }
  return { workspaces, papers, explorePapers, news, selections };
}

export function buildWorkspaceMentionLabel(workspaceName: string): string {
  return `@${workspaceName}`;
}

export function buildPaperMentionLabel(workspaceName: string, paperTitle: string): string {
  return `@${workspaceName}:${paperTitle}`;
}

/** Label pill untuk paper Explore eksternal / berita (judulnya saja; tanpa prefix workspace). */
export function buildExternalPaperMentionLabel(paperTitle: string): string {
  return `@${paperTitle}`;
}

/** Berita Explore — label = judul saja (format sama dgn paper eksternal). */
export const buildNewsMentionLabel = buildExternalPaperMentionLabel;

/**
 * Label pill untuk pilihan blok editor ("Tanya Astra"). Pakai cuplikan teks bila ada
 * (`❝ "kutipan…"`, clamp 24 char); kalau pilihan kosong-teks (mis. heading/embed), pakai jumlah
 * blok (`❝ N blok`). Prefiks `❝` membedakannya secara visual dari pill workspace/paper.
 */
export function buildSelectionMentionLabel(excerpt: string, blockCount = 0): string {
  const trimmed = (excerpt ?? "").replace(/\s+/g, " ").trim();
  if (trimmed) return `❝ ${messagePreview(trimmed, 24)}`;
  if (blockCount > 0) return `❝ ${blockCount} blok`;
  return "❝ Pilihan";
}

/** Inline mention markers (private-use sentinels) — keep pills inline in sent text. */
export const MENTION_MARKER_OPEN = String.fromCharCode(0xe000);
export const MENTION_MARKER_CLOSE = String.fromCharCode(0xe001);

export function wrapMentionLabel(label: string): string {
  return `${MENTION_MARKER_OPEN}${label}${MENTION_MARKER_CLOSE}`;
}

/** Remove inline mention markers, keeping the readable label inside. */
export function stripMentionMarkers(text: string): string {
  // Common case (teks tanpa marker) → kembalikan apa adanya tanpa alokasi split/join. Penting:
  // processor input men-strip TIAP pesan user TIAP giliran, mayoritas tak ber-mention.
  if (!text.includes(MENTION_MARKER_OPEN) && !text.includes(MENTION_MARKER_CLOSE)) return text;
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

// ---------------------------------------------------------------------------
// ask_questions (HITL klarifikasi) — kontrak BERSAMA web (render kartu Questions),
// agent (tool suspend/resume), dan workflow /deep (step `clarify`). Pure & zero-dep
// di sini; skema zod dibangun di sisi agent (`lib/ask-questions-schema.ts`) lalu
// diasersi cocok dengan tipe ini (SATU SSOT, drift = error compile). Sejajar pola
// built-in `ask_user` Mastra, tapi PLURAL: satu kartu bisa memuat >1 pertanyaan →
// satu resume.
// ---------------------------------------------------------------------------

/** Tipe interaksi satu pertanyaan: `single` = radio (≤1 pilihan), `multi` = checkbox (>1). */
export type AskQuestionKind = "single" | "multi";

/** Satu opsi terstruktur; `description` opsional (konteks, tak mengubah nilai jawaban). */
export type AskQuestionOption = { label: string; description?: string };

/**
 * Satu pertanyaan klarifikasi. `options` boleh kosong HANYA untuk pertanyaan freeform murni
 * (kind `single` tanpa opsi → input teks). `allowOther` menambah opsi "Lainnya…" (input bebas)
 * di samping opsi terstruktur (single: eksklusif dengan pilihan lain; multi: bisa dikombinasi).
 */
export type AskQuestion = {
  id: string;
  prompt: string;
  kind: AskQuestionKind;
  options: AskQuestionOption[];
  allowOther?: boolean;
};

/** Payload yang dipancarkan ke FE saat tool/step suspend → dirender jadi kartu Questions. */
export type AskQuestionsSuspendPayload = { questions: AskQuestion[] };

/**
 * Jawaban satu pertanyaan. `selected` = label opsi terpilih (single: panjang ≤1); `other` = teks
 * freeform bila opsi "Lainnya…" dipakai (single: menggantikan `selected`; multi: mendampinginya).
 */
export type AskQuestionAnswer = { id: string; selected: string[]; other?: string };

/** Data resume: user menjawab (sebagian boleh kosong) atau melewati (agent lanjut dgn asumsi). */
export type AskQuestionsResumeData =
  | { action: "answered"; answers: AskQuestionAnswer[] }
  | { action: "skipped" };

/**
 * Label opsi yang sebetulnya penanda "isi sendiri" (mis. "Lainnya", "Lainnya…", "Other", "Tulis
 * sendiri"). Model kadang menambah opsi seperti ini SEKALIGUS set `allowOther` → dobel "Lainnya".
 */
export function isOtherLikeOptionLabel(label: string): boolean {
  const s = label.trim().toLowerCase().replace(/[.…\s]+$/, "").trim();
  return (
    s === "lain" ||
    s === "lain-lain" ||
    s === "lainnya" ||
    s === "tulis sendiri" ||
    s === "other" ||
    s === "others" ||
    // "Lainnya (sebutkan)", "Other, specify", "Lainnya: …" → penanda isi-sendiri berkualifikator.
    // BUKAN opsi konkret yang kebetulan diawali kata itu (mis. "Other renewable sources"), yang
    // dulu ikut terbuang karena `startsWith` tak beranjak.
    /^(?:lainnya|other)\s*[(:,-]/.test(s)
  );
}

/**
 * Rapikan opsi + `allowOther`: opsi yang sebenarnya penanda "isi sendiri" dibuang dan `allowOther`
 * di-set true → hanya ada SATU chip "Lainnya…" (input freeform), tak pernah kembar. Dipakai FE
 * (render) & backend (/deep normalisasi) sebagai SSOT normalisasi.
 */
export function normalizeAskOtherOption(
  options: AskQuestionOption[],
  allowOther: boolean | undefined,
): { options: AskQuestionOption[]; allowOther: boolean } {
  const kept: AskQuestionOption[] = [];
  let other = allowOther === true;
  for (const o of options) {
    if (isOtherLikeOptionLabel(o.label)) other = true;
    else kept.push(o);
  }
  return { options: kept, allowOther: other };
}

/** Satu opsi ask_questions dari payload mentah (string atau `{label,description?}`). */
function parseAskOption(o: unknown): AskQuestionOption | null {
  if (typeof o === "string") {
    const label = o.trim();
    return label ? { label } : null;
  }
  if (!o || typeof o !== "object") return null;
  const rec = o as { label?: unknown; description?: unknown };
  const label = typeof rec.label === "string" ? rec.label.trim() : "";
  if (!label) return null;
  const description = typeof rec.description === "string" ? rec.description.trim() : "";
  return description ? { label, description } : { label };
}

/**
 * Normalisasi payload mentah (stream/snapshot Mastra ATAU output model /deep) → `AskQuestion[]`.
 * SATU SSOT dipakai reducer FE (live + re-attach refresh) DAN backend /deep — sebelumnya diduplikasi
 * per app. Item tanpa `prompt` dibuang; `id` fallback `q${i+1}`; opsi "Lainnya"/"Other" dilipat ke
 * `allowOther` (satu chip freeform); tanpa opsi tersisa → pertanyaan freeform murni. `opts.max`
 * membatasi jumlah pertanyaan (mis. /deep = 3).
 */
export function normalizeAskQuestions(raw: unknown, opts?: { max?: number }): AskQuestion[] {
  if (!Array.isArray(raw)) return [];
  const out: AskQuestion[] = [];
  raw.forEach((item, i) => {
    if (!item || typeof item !== "object") return;
    const q = item as { id?: unknown; prompt?: unknown; kind?: unknown; options?: unknown; allowOther?: unknown };
    const prompt = typeof q.prompt === "string" ? q.prompt.trim() : "";
    if (!prompt) return;
    const id = typeof q.id === "string" && q.id.trim() ? q.id.trim() : `q${i + 1}`;
    const rawOptions = Array.isArray(q.options)
      ? q.options.map(parseAskOption).filter((o): o is AskQuestionOption => o !== null)
      : [];
    const { options, allowOther } = normalizeAskOtherOption(rawOptions, q.allowOther === true);
    if (options.length === 0) {
      out.push({ id, prompt, kind: "single", options: [], allowOther: true });
    } else {
      out.push({ id, prompt, kind: q.kind === "multi" ? "multi" : "single", options, allowOther });
    }
  });
  return typeof opts?.max === "number" ? out.slice(0, opts.max) : out;
}

/** Apakah satu jawaban terisi (punya pilihan atau teks freeform). */
export function askAnswerIsFilled(answer: AskQuestionAnswer | undefined): boolean {
  if (!answer) return false;
  return answer.selected.length > 0 || (answer.other?.trim().length ?? 0) > 0;
}

/** Nilai jawaban satu pertanyaan sebagai teks ringkas untuk model (gabung pilihan + freeform). */
export function askAnswerToText(answer: AskQuestionAnswer): string {
  const parts = [...answer.selected];
  const other = answer.other?.trim();
  if (other) parts.push(other);
  return parts.join(", ");
}

/**
 * Rangkai Q&A menjadi teks yang dibaca model setelah resume (dikembalikan tool ke LLM). Pertanyaan
 * tanpa jawaban ditandai "(dilewati)" agar model memakai asumsi wajar untuk bagian itu.
 */
export function formatAskAnswersForModel(
  questions: AskQuestion[],
  resume: AskQuestionsResumeData,
): string {
  if (resume.action === "skipped") {
    return "Pengguna melewati semua pertanyaan klarifikasi. Lanjutkan dengan asumsi paling wajar dan sebutkan asumsi itu secara eksplisit.";
  }
  const byId = new Map(resume.answers.map((a) => [a.id, a]));
  const lines = questions.map((q, i) => {
    const a = byId.get(q.id);
    const text = a && askAnswerIsFilled(a) ? askAnswerToText(a) : "(dilewati)";
    return `${i + 1}. ${q.prompt}\n   → ${text}`;
  });
  return `Jawaban klarifikasi pengguna:\n${lines.join("\n")}`;
}

/** Render pertanyaan sebagai teks (fallback saat tool dipanggil di luar agent — tanpa suspend). */
export function renderAskQuestionsAsText(questions: AskQuestion[]): string {
  return questions
    .map((q, i) => {
      const opts = q.options.length
        ? `\n   Opsi: ${q.options.map((o) => o.label).join(", ")}${q.allowOther ? ", Lainnya…" : ""}`
        : "";
      return `${i + 1}. ${q.prompt}${opts}`;
    })
    .join("\n");
}
