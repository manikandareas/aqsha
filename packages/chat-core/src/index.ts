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
  group: "Metodologi" | "Penulisan Bab" | "Literatur" | "Bahasa & Sitasi" | "Pertahanan" | "Workspace";
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
  // --- Metodologi ---------------------------------------------------------
  {
    id: "kuantitatif",
    slug: "/kuantitatif",
    label: "Jalur kuantitatif",
    description: "Variabel, hipotesis, sampel, instrumen, dan uji statistik.",
    group: "Metodologi",
    aliases: ["/kuanti"],
    keywords: ["kuantitatif", "quantitative", "variabel", "hipotesis", "statistik", "sampel", "instrumen", "metodologi"],
    placeholder: "Tulis topik dan konteks penelitianmu...",
    buildPrompt: (argument) =>
      [
        "Bantu rancang penelitian KUANTITATIF untuk topik berikut.",
        "Berikan: jenis/desain penelitian, variabel (bebas/terikat/kontrol) beserta definisi operasional, hipotesis (H0/Ha), populasi & teknik sampling dengan estimasi ukuran sampel, instrumen & skala pengukuran, serta uji statistik yang sesuai beserta asumsinya.",
        "Jika sebuah uji statistik spesifik dibahas, baca skill verify-statistics dulu lalu ikuti. Jangan mengarang data, angka, atau hasil; tandai bagian yang butuh justifikasi teori sebagai [perlu sumber].",
        "",
        withInput(argument, "[Konteks penelitian belum diberikan]"),
      ].join("\n"),
  },
  {
    id: "kualitatif",
    slug: "/kualitatif",
    label: "Jalur kualitatif",
    description: "Fenomenologi/studi kasus, informan, koding tematik, triangulasi.",
    group: "Metodologi",
    aliases: ["/kuali"],
    keywords: ["kualitatif", "qualitative", "fenomenologi", "studi kasus", "informan", "koding tematik", "triangulasi"],
    placeholder: "Tulis fenomena dan konteks yang ingin dipahami...",
    buildPrompt: (argument) =>
      [
        "Bantu rancang penelitian KUALITATIF untuk fenomena berikut.",
        "Berikan: paradigma & pendekatan (mis. fenomenologi, studi kasus, etnografi, grounded theory), pertanyaan penelitian, kriteria & strategi pemilihan informan, teknik pengumpulan data (wawancara/observasi/dokumen), rencana koding tematik, serta strategi keabsahan data (triangulasi, member checking).",
        "Jaga posisi peneliti (refleksivitas) tetap eksplisit. Jangan mengarang temuan atau kutipan informan; tandai asumsi yang perlu divalidasi di lapangan.",
        "",
        withInput(argument, "[Fenomena penelitian belum diberikan]"),
      ].join("\n"),
  },
  {
    id: "campuran",
    slug: "/campuran",
    label: "Metode campuran",
    description: "Padukan pendekatan kuantitatif dan kualitatif secara koheren.",
    group: "Metodologi",
    aliases: ["/mixed", "/mixedmethod"],
    keywords: ["campuran", "mixed method", "mixed methods", "kuantitatif kualitatif", "konvergen", "sekuensial"],
    placeholder: "Tulis tujuan penelitian dan data yang tersedia...",
    buildPrompt: (argument) =>
      [
        "Rancang desain METODE CAMPURAN (mixed methods) untuk penelitian berikut.",
        "Tentukan tipe desain (konvergen paralel, sekuensial eksplanatori, atau eksploratori), alasan pemilihannya, porsi & urutan komponen kuantitatif dan kualitatif, titik integrasi (mixing), serta bagaimana kedua jenis data saling menguatkan kesimpulan.",
        "Jangan mengarang data. Tandai keputusan yang butuh dasar teori/metodologi sebagai [perlu sumber].",
        "",
        withInput(argument, "[Konteks penelitian belum diberikan]"),
      ].join("\n"),
  },
  {
    id: "rnd",
    slug: "/rnd",
    label: "Penelitian & pengembangan",
    description: "Kerangka R&D: ADDIE, 4D, atau Borg & Gall.",
    group: "Metodologi",
    aliases: ["/rd", "/pengembangan"],
    keywords: ["rnd", "r&d", "research and development", "pengembangan", "addie", "4d", "borg gall", "produk"],
    placeholder: "Tulis produk/model yang ingin dikembangkan...",
    buildPrompt: (argument) =>
      [
        "Rancang penelitian PENGEMBANGAN (R&D) untuk produk/model berikut.",
        "Pilih model pengembangan yang sesuai (ADDIE, 4D, atau Borg & Gall) dan jabarkan tiap tahapannya untuk konteks ini: analisis kebutuhan, desain produk, validasi ahli, uji coba (terbatas & lapangan), instrumen kelayakan/efektivitas, dan revisi.",
        "Jangan mengarang hasil uji coba atau skor validasi; tandai bagian yang butuh data lapangan sebagai [perlu sumber].",
        "",
        withInput(argument, "[Produk/model belum diberikan]"),
      ].join("\n"),
  },
  // --- Penulisan Bab ------------------------------------------------------
  {
    id: "latarbelakang",
    slug: "/latarbelakang",
    label: "Latar belakang",
    description: "Alur fenomena, urgensi, hingga gap penelitian.",
    group: "Penulisan Bab",
    aliases: ["/latar", "/background"],
    keywords: ["latar belakang", "background", "pendahuluan", "urgensi", "gap", "fenomena"],
    placeholder: "Tulis topik, fenomena, dan data awal yang kamu punya...",
    buildPrompt: (argument) =>
      [
        "Susun LATAR BELAKANG (Bab 1) untuk topik berikut dengan alur: kondisi ideal → kesenjangan dengan kenyataan → urgensi → gap penelitian → posisi studi ini.",
        "Buat argumen mengalir dari umum ke khusus dan bermuara ke rumusan masalah. Jangan mengarang statistik, kutipan, atau nama peneliti; tandai setiap klaim empiris yang butuh rujukan sebagai [perlu sumber].",
        "",
        withInput(argument, "[Topik/fenomena belum diberikan]"),
      ].join("\n"),
  },
  {
    id: "rumusanmasalah",
    slug: "/rumusanmasalah",
    label: "Rumusan masalah",
    description: "Turunkan rumusan dan pertanyaan penelitian dari latar belakang.",
    group: "Penulisan Bab",
    aliases: ["/rumusan", "/rq", "/research-question"],
    keywords: ["rumusan masalah", "pertanyaan penelitian", "research question", "rq", "masalah"],
    placeholder: "Tempel latar belakang atau tulis fokus penelitian...",
    buildPrompt: (argument) =>
      [
        "Turunkan RUMUSAN MASALAH dari konteks berikut.",
        "Berikan: pernyataan masalah ringkas, 3-5 pertanyaan penelitian yang tajam dan sejajar dengan tujuan, batasan masalah, serta variabel/konsep kunci. Pastikan konsisten dengan latar belakang.",
        "Jangan membuat klaim faktual spesifik tanpa menandainya sebagai asumsi yang perlu diverifikasi.",
        "",
        withInput(argument, "[Konteks penelitian belum diberikan]"),
      ].join("\n"),
  },
  {
    id: "tujuan",
    slug: "/tujuan",
    label: "Tujuan penelitian",
    description: "Rumuskan tujuan yang selaras dengan rumusan masalah.",
    group: "Penulisan Bab",
    aliases: ["/tujuanpenelitian"],
    keywords: ["tujuan penelitian", "tujuan", "objective", "manfaat"],
    placeholder: "Tempel rumusan masalah atau tulis fokus penelitian...",
    buildPrompt: (argument) =>
      [
        "Rumuskan TUJUAN PENELITIAN dari rumusan masalah berikut.",
        "Setiap tujuan harus sejajar satu-satu dengan pertanyaan penelitian dan memakai kata kerja terukur (menganalisis, menguji, mendeskripsikan, mengembangkan). Bila relevan, tambahkan manfaat teoretis dan praktis secara singkat.",
        "Jangan menambah tujuan yang tak berakar pada rumusan masalah.",
        "",
        withInput(argument, "[Rumusan masalah belum diberikan]"),
      ].join("\n"),
  },
  {
    id: "hipotesis",
    slug: "/hipotesis",
    label: "Hipotesis",
    description: "Susun hipotesis teruji dari kerangka teori.",
    group: "Penulisan Bab",
    aliases: ["/hipo", "/hypothesis"],
    keywords: ["hipotesis", "hypothesis", "h0", "ha", "dugaan"],
    placeholder: "Tulis variabel dan kerangka teori yang relevan...",
    buildPrompt: (argument) =>
      [
        "Susun HIPOTESIS penelitian dari variabel dan kerangka teori berikut.",
        "Nyatakan hipotesis nol (H0) dan alternatif (Ha) untuk tiap hubungan/pengaruh, jelaskan dasar teoretis tiap dugaan, dan sebutkan arah hubungan bila ada. Selaraskan dengan pertanyaan penelitian.",
        "Jangan mengklaim hasil uji; tandai dasar teori yang masih perlu rujukan sebagai [perlu sumber].",
        "",
        withInput(argument, "[Variabel/kerangka teori belum diberikan]"),
      ].join("\n"),
  },
  {
    id: "kerangka",
    slug: "/kerangka",
    label: "Kerangka teori",
    description: "Kerangka teori dan kerangka berpikir yang runtut.",
    group: "Penulisan Bab",
    aliases: ["/kerangkateori", "/outline"],
    keywords: ["kerangka teori", "kerangka berpikir", "landasan teori", "outline", "theoretical framework"],
    placeholder: "Tulis topik, variabel, dan teori utama...",
    buildPrompt: (argument) =>
      [
        "Bangun KERANGKA TEORI dan KERANGKA BERPIKIR untuk topik berikut.",
        "Petakan teori/konsep utama, definisi tiap konstruk, hubungan antar-variabel, dan alur logika yang menghubungkan teori ke hipotesis/pertanyaan penelitian. Sertakan deskripsi bagan kerangka berpikir (dari variabel bebas ke terikat).",
        "Jangan mengarang sitasi atau teori; tandai setiap kebutuhan rujukan sebagai [perlu sumber].",
        "",
        withInput(argument, "[Topik/variabel belum diberikan]"),
      ].join("\n"),
  },
  {
    id: "pembahasan",
    slug: "/pembahasan",
    label: "Pembahasan",
    description: "Interpretasi temuan, kaitkan dengan teori dan penelitian lain.",
    group: "Penulisan Bab",
    aliases: ["/diskusi", "/discussion"],
    keywords: ["pembahasan", "diskusi", "discussion", "interpretasi", "temuan"],
    placeholder: "Tempel temuan/hasil yang ingin dibahas...",
    buildPrompt: (argument) =>
      [
        "Tulis PEMBAHASAN atas temuan berikut.",
        "Untuk tiap temuan: interpretasikan maknanya, kaitkan dengan teori dan penelitian terdahulu (dukungan maupun pertentangan), jelaskan mengapa hasilnya demikian, lalu tarik implikasi teoretis/praktis dan keterbatasannya.",
        "Bahas hanya temuan yang benar-benar diberikan. Jangan mengarang hasil atau membandingkan dengan sumber yang tak nyata; tandai perbandingan yang butuh rujukan sebagai [perlu sumber].",
        "",
        withInput(argument, "[Temuan/hasil belum diberikan]"),
      ].join("\n"),
  },
  {
    id: "kesimpulan",
    slug: "/kesimpulan",
    label: "Kesimpulan & saran",
    description: "Simpulan ringkas dan saran tindak lanjut.",
    group: "Penulisan Bab",
    aliases: ["/simpulan", "/conclusion"],
    keywords: ["kesimpulan", "simpulan", "saran", "conclusion", "penutup"],
    placeholder: "Tempel temuan utama dan pertanyaan penelitian...",
    buildPrompt: (argument) =>
      [
        "Tulis KESIMPULAN dan SARAN dari penelitian berikut.",
        "Kesimpulan menjawab langsung tiap pertanyaan penelitian secara ringkas (tanpa mengulang seluruh pembahasan). Saran dibagi untuk pihak terkait dan penelitian selanjutnya, bersifat spesifik dan dapat ditindaklanjuti.",
        "Jangan menambah temuan baru yang tak dibahas sebelumnya.",
        "",
        withInput(argument, "[Temuan/pertanyaan penelitian belum diberikan]"),
      ].join("\n"),
  },
  {
    id: "abstrak",
    slug: "/abstrak",
    label: "Abstrak",
    description: "250 kata plus kata kunci, versi Indonesia dan Inggris.",
    group: "Penulisan Bab",
    aliases: ["/abstract"],
    keywords: ["abstrak", "abstract", "kata kunci", "keywords", "ringkasan"],
    placeholder: "Tempel ringkasan penelitian (masalah, metode, hasil)...",
    buildPrompt: (argument) =>
      [
        "Tulis ABSTRAK akademik dari materi berikut, sekitar 200-250 kata.",
        "Cakup latar/tujuan, metode (desain, subjek, analisis), hasil utama, dan simpulan/implikasi sebagai satu paragraf padat. Sertakan 3-5 kata kunci. Buat DUA versi setara: Bahasa Indonesia dan Bahasa Inggris.",
        "Hanya rangkum informasi yang diberikan; jangan menambah angka atau temuan baru.",
        "",
        withInput(argument, "[Ringkasan penelitian belum diberikan]"),
      ].join("\n"),
  },
  // --- Literatur ----------------------------------------------------------
  {
    id: "gap",
    slug: "/gap",
    label: "Deteksi research gap",
    description: "Temukan celah riset dari paper di library.",
    group: "Literatur",
    aliases: ["/researchgap", "/celah"],
    keywords: ["gap", "research gap", "celah riset", "kebaruan", "novelty", "library"],
    placeholder: "Tulis topik/fokus, atau sematkan paper library dulu...",
    buildPrompt: (argument) =>
      [
        "Deteksi RESEARCH GAP untuk topik berikut dari literatur yang tersedia.",
        "Gunakan paper yang disematkan (@mention) atau telusuri library via list_artifacts/search_thread_documents; bila belum ada sumber, minta klarifikasi lewat ask_questions. Petakan apa yang sudah banyak diteliti, apa yang bertentangan, dan apa yang belum terjawab (gap teori, metode, konteks, atau populasi), lalu usulkan arah kebaruan.",
        "Hanya simpulkan gap dari sumber nyata yang terbaca; jangan mengarang temuan atau sitasi.",
        "",
        withInput(argument, "[Topik/fokus belum diberikan]"),
      ].join("\n"),
  },
  {
    id: "matriks",
    slug: "/matriks",
    label: "Matriks sintesis",
    description: "Tabel Penulis (Tahun), Metode, Sampel, Temuan, Relevansi dari library.",
    group: "Literatur",
    aliases: ["/matrix", "/sintesis"],
    keywords: ["matriks", "matrix", "sintesis", "literature matrix", "tabel", "review", "library"],
    placeholder: "Tulis topik sintesis, atau sematkan paper library dulu...",
    buildPrompt: (argument) =>
      [
        "Susun MATRIKS SINTESIS LITERATUR dari paper di library.",
        "Baca skill synthesis-matrix lebih dulu, lalu ikuti. Ambil sumber dari paper yang disematkan (@mention) atau via list_artifacts/search_thread_documents; bila belum ada sumber, tanyakan lewat ask_questions. Keluarkan tabel berkolom Penulis (Tahun) · Metode · Sampel · Temuan utama · Relevansi sebagai artifact (propose_artifact), lalu tutup dengan paragraf sintesis (pola dan gap).",
        "Hanya gunakan data nyata dari tool; kosongkan sel yang tak diketahui, jangan mengarang.",
        "",
        withInput(argument, "[Topik/fokus sintesis belum diberikan]"),
      ].join("\n"),
  },
  {
    id: "terdahulu",
    slug: "/terdahulu",
    label: "Penelitian terdahulu",
    description: "Susun pembanding penelitian terdahulu dari matriks.",
    group: "Literatur",
    aliases: ["/litreview", "/literature-review", "/tinjauan"],
    keywords: ["penelitian terdahulu", "tinjauan pustaka", "kajian pustaka", "literature review", "state of the art"],
    placeholder: "Tulis topik, atau sematkan paper library dulu...",
    buildPrompt: (argument) =>
      [
        "Susun bagian PENELITIAN TERDAHULU dari literatur yang tersedia.",
        "Baca skill synthesis-matrix untuk mengekstrak tiap studi, lalu tulis naratif pembanding: untuk tiap penelitian terdahulu sebutkan penulis (tahun), fokus, metode, temuan, serta persamaan dan perbedaan dengan penelitian ini, diakhiri posisi kebaruan studimu. Gunakan paper yang disematkan (@mention) atau library via list_artifacts/search_thread_documents.",
        "Hanya rujuk sumber nyata yang terbaca; jangan mengarang penelitian atau sitasi.",
        "",
        withInput(argument, "[Topik/fokus belum diberikan]"),
      ].join("\n"),
  },
  {
    id: "deep",
    slug: "/deep",
    label: "Deep research",
    description: "Riset mendalam multi-sumber dengan sitasi terverifikasi.",
    group: "Literatur",
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
  // --- Bahasa & Sitasi ----------------------------------------------------
  {
    id: "akademik",
    slug: "/akademik",
    label: "Gaya akademik",
    description: "Kalimat efektif, ejaan baku, dan nada ilmiah.",
    group: "Bahasa & Sitasi",
    aliases: ["/ilmiah", "/academic"],
    keywords: ["akademik", "gaya akademik", "ilmiah", "kalimat efektif", "baku", "formal"],
    placeholder: "Tempel teks yang ingin dirapikan jadi akademik...",
    buildPrompt: (argument) =>
      [
        "Perbaiki teks berikut menjadi bahasa Indonesia akademik yang efektif.",
        "Baca skill write-academic-id lalu ikuti. Rapikan register formal, ganti kata tak baku, ringkas kalimat berbelit, dan jaga konsistensi istilah tanpa mengubah makna atau menambah klaim/sumber baru.",
        "",
        withInput(argument, "[Teks belum diberikan]"),
      ].join("\n"),
  },
  {
    id: "puebi",
    slug: "/puebi",
    label: "Ejaan PUEBI",
    description: "Rapikan ejaan, kata baku, dan tanda baca.",
    group: "Bahasa & Sitasi",
    aliases: ["/eyd", "/ejaan"],
    keywords: ["puebi", "eyd", "ejaan", "tanda baca", "kata baku", "kbbi"],
    placeholder: "Tempel teks yang ingin diperiksa ejaannya...",
    buildPrompt: (argument) =>
      [
        "Periksa dan perbaiki EJAAN teks berikut sesuai PUEBI.",
        "Baca skill write-academic-id lalu ikuti. Betulkan penulisan kata baku (rujuk KBBI), huruf kapital, huruf miring untuk istilah asing, tanda baca, penulisan angka, serta imbuhan/kata depan. Jangan mengubah makna; cukup perbaiki ejaan dan tata tulis.",
        "",
        withInput(argument, "[Teks belum diberikan]"),
      ].join("\n"),
  },
  {
    id: "sitasi",
    slug: "/sitasi",
    label: "Sitasi APA",
    description: "Format sitasi dan daftar pustaka APA dari paper terpilih.",
    group: "Bahasa & Sitasi",
    aliases: ["/citation", "/apa"],
    keywords: ["sitasi", "citation", "apa", "daftar pustaka", "referensi", "bibliografi"],
    placeholder: "Tempel sumber, atau sematkan paper yang ingin disitasi...",
    buildPrompt: (argument) =>
      [
        "Format SITASI dan DAFTAR PUSTAKA gaya APA (edisi 7) dari sumber terpilih.",
        "Baca skill cite-apa7 dan ikuti aturannya. Bila sumber merujuk artifact/paper yang tersimpan, verifikasi keberadaannya dengan verify_citations sebelum memformat. Hasilkan kutipan dalam-teks dan entri daftar pustaka yang urut alfabetis.",
        "Jangan membuat entri untuk sumber yang tak terverifikasi; tandai yang ragu sebagai [perlu sumber].",
        "",
        withInput(argument, "[Sumber untuk disitasi belum diberikan]"),
      ].join("\n"),
  },
  {
    id: "parafrase",
    slug: "/parafrase",
    label: "Parafrase bersitasi",
    description: "Tulis ulang dengan sitasi yang benar, bukan akali kemiripan.",
    group: "Bahasa & Sitasi",
    aliases: ["/paraphrase", "/parapharse"],
    keywords: ["parafrase", "paraphrase", "tulis ulang", "rewrite", "sitasi", "kutipan"],
    placeholder: "Tempel paragraf yang ingin diparafrase...",
    buildPrompt: (argument) =>
      [
        "Parafrase teks berikut ke dalam bahasa Indonesia akademik yang jernih, dengan sitasi yang benar.",
        "Baca skill write-academic-id lalu ikuti. Pertahankan makna dan batas klaim; ubah struktur dan diksi, bukan sekadar mengganti kata. Bila teks memuat gagasan dari sumber, jaga atribusinya dan tandai tempat sitasi seharusnya berada sebagai [perlu sumber]. Jangan menambah fakta atau sumber baru.",
        "",
        withInput(argument, "[Teks belum diberikan]"),
      ].join("\n"),
  },
  {
    id: "expand",
    slug: "/expand",
    label: "Kembangkan ide",
    description: "Perluas paragraf atau gagasan dengan batas klaim yang eksplisit.",
    group: "Bahasa & Sitasi",
    aliases: ["/kembangkan"],
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
    group: "Bahasa & Sitasi",
    aliases: ["/ringkas"],
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
  // --- Pertahanan ---------------------------------------------------------
  {
    id: "sidang",
    slug: "/sidang",
    label: "Simulasi sidang",
    description: "Prediksi pertanyaan dosen penguji dari draftmu.",
    group: "Pertahanan",
    aliases: ["/ujian", "/defense"],
    keywords: ["sidang", "ujian", "penguji", "defense", "pertanyaan", "simulasi"],
    placeholder: "Tempel abstrak/draft yang akan disidangkan...",
    buildPrompt: (argument) =>
      [
        "Simulasikan SIDANG: berperanlah sebagai dosen penguji yang kritis namun adil.",
        "Dari draft/ringkasan berikut, ajukan 8-12 pertanyaan penguji yang mencakup metodologi, kebaruan, validitas & keandalan, generalisasi, dan etika, urut dari umum ke tajam. Untuk tiap pertanyaan, beri poin singkat arah menjawabnya.",
        "Berpijak hanya pada isi draft yang diberikan; jangan mengarang klaim atau data yang tak ada.",
        "",
        withInput(argument, "[Draft/ringkasan belum diberikan]"),
      ].join("\n"),
  },
  {
    id: "reviewer",
    slug: "/reviewer",
    label: "Kritik pembimbing",
    description: "Kritik tulisan seperti dosen pembimbing sebelum kena coret.",
    group: "Pertahanan",
    aliases: ["/reviu", "/review"],
    keywords: ["reviewer", "review", "reviu", "kritik", "pembimbing", "revisi", "koreksi"],
    placeholder: "Tempel tulisan yang ingin dikritik...",
    buildPrompt: (argument) =>
      [
        "Kritik tulisan berikut seperti dosen pembimbing yang teliti.",
        "Beri umpan balik terstruktur: sebutkan kekuatan, lalu masalah pada argumen/logika, struktur, metodologi, kejelasan, dan konsistensi istilah. Untuk tiap masalah, tunjukkan lokasinya dan beri saran perbaikan konkret. Prioritaskan yang paling berisiko dicoret.",
        "Nilai hanya teks yang diberikan; jangan mengarang bagian yang tak ada.",
        "",
        withInput(argument, "[Tulisan belum diberikan]"),
      ].join("\n"),
  },
  // --- Workspace ----------------------------------------------------------
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

/** Lookup command by exact slug or alias (mis. `/kuanti` → command `kuantitatif`). */
export function getPromptCommandBySlug(slug: string): PromptCommand | null {
  return (
    promptCommands.find(
      (command) => command.slug === slug || command.aliases.some((alias) => alias === slug),
    ) ?? null
  );
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Sumber pattern di-cache (promptCommands konstan); regex `g` stateful (lastIndex),
// jadi factory mengembalikan instance BARU per pemanggilan.
let commandSlugPatternSource: string | null = null;

/**
 * Regex global pencocok slug/alias command di teks bebas, dengan word boundary:
 * harus didahului awal-string/whitespace/kurung-kutip buka (grup-1 capture), dan
 * TIDAK diikuti karakter kata (`/matriks!` cocok, `x.co/matriks` &
 * `/kuantitatifxyz` tidak). Slug ada di grup-2 (bukan `match[0]`) karena boundary
 * ikut dikonsumsi — SENGAJA capture, bukan lookbehind: lookbehind (`(?<=…)`) baru
 * ada di Safari 16.4+, dan SWC tak mentranspilasi regex, jadi WebView/iOS lama
 * akan `SyntaxError` saat `new RegExp`. Alternatif diurutkan terpanjang-dulu
 * supaya alias prefix (mis. `/kuanti` vs `/kuantitatif`) tak saling memakan.
 * Dipakai composer (chip-ify draft) dan bubble user (pill command) — SATU sumber
 * kebenaran pencocokan.
 */
export function promptCommandSlugPattern(): RegExp {
  if (commandSlugPatternSource === null) {
    const slugs = promptCommands
      .flatMap((command) => [command.slug, ...command.aliases])
      .sort((a, b) => b.length - a.length)
      .map(escapeRegex);
    commandSlugPatternSource = `(^|[\\s([{"'])(${slugs.join("|")})(?![\\w/-])`;
  }
  return new RegExp(commandSlugPatternSource, "g");
}

export type CommandSegment =
  | { type: "text"; value: string }
  | { type: "command"; command: PromptCommand; matched: string };

/**
 * Pecah teks bebas jadi segmen teks / command (slug atau alias yang dikenal).
 * Dipakai bubble pesan user untuk merender command sebagai pill — command
 * terserialisasi sebagai slug polos (tanpa marker), jadi parsing by-slug di
 * sisi render juga menghidupkan styling untuk pesan lama.
 */
export function parseCommandSegments(text: string): CommandSegment[] {
  // Jalur cepat: mayoritas pesan tak memuat "/" sama sekali.
  if (!text.includes("/")) return text ? [{ type: "text", value: text }] : [];
  const segments: CommandSegment[] = [];
  let lastIndex = 0;
  for (const match of text.matchAll(promptCommandSlugPattern())) {
    // Boundary (grup-1) ikut dikonsumsi → geser index ke awal slug (grup-2).
    const boundary = match[1] ?? "";
    const index = (match.index ?? 0) + boundary.length;
    const matched = match[2] ?? "";
    const command = getPromptCommandBySlug(matched);
    if (!command) continue;
    if (index > lastIndex) segments.push({ type: "text", value: text.slice(lastIndex, index) });
    segments.push({ type: "command", command, matched });
    lastIndex = index + matched.length;
  }
  if (lastIndex < text.length) segments.push({ type: "text", value: text.slice(lastIndex) });
  return segments;
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
