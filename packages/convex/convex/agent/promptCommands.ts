export const PROMPT_COMMAND_MODE = ["normal", "deep"] as const;

export type PromptCommandMode = (typeof PROMPT_COMMAND_MODE)[number];

export type PromptCommand = {
  id: string;
  slug: string;
  label: string;
  description: string;
  group: "Tulis Akademik" | "Rancang Riset" | "Riset Mendalam" | "Workspace";
  aliases: string[];
  keywords: string[];
  mode: PromptCommandMode;
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
    mode: "normal",
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
    mode: "normal",
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
    mode: "normal",
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
    mode: "normal",
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
    mode: "normal",
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
    mode: "normal",
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
    mode: "normal",
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
    id: "deep-research",
    slug: "/deep-research",
    label: "Riset mendalam",
    description: "Jalankan Deep mode untuk laporan berbasis sumber dan sitasi.",
    group: "Riset Mendalam",
    aliases: ["/deep"],
    keywords: ["deep research", "riset mendalam", "laporan", "sumber", "citation"],
    mode: "deep",
    placeholder: "Tulis pertanyaan riset lengkap...",
    buildPrompt: (argument) =>
      [
        "Jalankan Deep Research untuk permintaan berikut.",
        "Susun laporan berbasis sumber dengan proses pencarian, pembacaan, sintesis, dan pemeriksaan kutipan.",
        "Prioritaskan konteks workspace yang dipilih pengguna bila relevan, lalu sumber publik. Laporkan ketidakpastian dan celah bukti.",
        "",
        withInput(argument, "[Pertanyaan riset belum diberikan]"),
      ].join("\n"),
  },
  {
    id: "artifact",
    slug: "/artifact",
    label: "Kelola artifact workspace",
    description: "Buat, perbarui, atau hapus dokumen Markdown di workspace dengan konfirmasi.",
    group: "Workspace",
    aliases: [],
    keywords: ["artifact", "artefak", "dokumen", "workspace", "markdown"],
    mode: "normal",
    placeholder: "Contoh: cerita rakyat, perbarui outline tesis, hapus draft lama...",
    buildPrompt: (argument) =>
      [
        "Jalankan perintah workspace artifact berikut menggunakan HITL tools — jangan tanya di chat biasa.",
        "WAJIB: create → askHuman dulu (1-2 pertanyaan), setelah user jawab via kartu → presentPlan. Update → askHuman jika tidak jelas, else presentPlan. Delete → confirmAction.",
        "Jangan tulis daftar pilihan (1/2/3) di chat. Jangan minta user membalas teks bebas — pakai askHuman.",
        "Inferensi intent: buat/bikin/tulis/create = create; perbarui/update = update; hapus/delete = delete.",
        "Untuk create, meskipun instruksi sudah jelas (mis. 'buat cerita rakyat'), tetap askHuman dulu (judul, panjang, nada, atau struktur) sebelum presentPlan.",
        "presentPlan: sertakan planBullets (3-6 poin) tanpa Markdown final — isi dokumen dibuat setelah user menekan Build.",
        "Summary presentPlan: jelaskan apa yang akan dibuat (1-2 kalimat), jangan sebut UI/kartu/Build/tombol.",
        "Setelah memanggil tool HITL, balas maksimal satu kalimat singkat.",
        "",
        withInput(argument, "[Instruksi artifact belum diberikan]"),
      ].join("\n"),
  },
  {
    id: "workspace",
    slug: "/workspace",
    label: "Kelola workspace",
    description: "Buat atau rename workspace dengan konfirmasi HITL.",
    group: "Workspace",
    aliases: [],
    keywords: ["workspace", "ruang kerja", "rename", "ganti nama", "buat workspace"],
    mode: "normal",
    placeholder: "Contoh: buat workspace Tesis 2026, rename workspace Draft jadi Final...",
    buildPrompt: (argument) =>
      [
        "Jalankan permintaan manajemen workspace berikut menggunakan HITL workspace tools — jangan tanya di chat biasa.",
        "WAJIB: create_workspace → askHuman jika nama/konteks belum jelas, lalu presentWorkspacePlan. rename_workspace → askHuman jika target workspace tidak jelas, lalu presentWorkspacePlan.",
        "Jangan tulis daftar pilihan (1/2/3) di chat. Gunakan askHuman untuk klarifikasi terstruktur.",
        "presentWorkspacePlan wajib memuat action, name (nama akhir yang diusulkan), planBullets (2-5 poin), dan workspaceId untuk rename bila sudah diketahui.",
        "Jangan eksekusi create/rename sebelum user menyetujui kartu Review plan.",
        "Setelah memanggil tool HITL, balas maksimal satu kalimat singkat.",
        "",
        withInput(argument, "[Instruksi workspace belum diberikan]"),
      ].join("\n"),
  },
] as const satisfies readonly PromptCommand[];

export type PromptCommandId = (typeof promptCommands)[number]["id"];

export function getPromptCommand(commandId: string | undefined | null) {
  if (!commandId) {
    return null;
  }
  return promptCommands.find((command) => command.id === commandId) ?? null;
}

export function buildPromptCommandPrompt(commandId: string, argument: string) {
  const command = getPromptCommand(commandId);
  if (!command) {
    return null;
  }
  return {
    command,
    expandedPrompt: command.buildPrompt(argument),
  };
}
