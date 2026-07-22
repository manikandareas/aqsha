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

/**
 * Payload yang dipancarkan ke FE saat tool/step suspend → dirender jadi kartu Questions.
 * `findings` adalah ringkasan temuan parsial yang sudah terkumpul di turn ini — wajib diisi
 * model bila ia sudah memanggil tool riset sebelum bertanya, supaya hasil riset tersaji ke user
 * (dirender di atas pertanyaan) alih-alih terbuang saat turn suspend.
 */
export type AskQuestionsSuspendPayload = {
  questions: AskQuestion[];
  findings?: string;
};

/**
 * Jawaban satu pertanyaan. `selected` = label opsi terpilih (single: panjang ≤1); `other` = teks
 * freeform bila opsi "Lainnya…" dipakai (single: menggantikan `selected`; multi: mendampinginya).
 */
export type AskQuestionAnswer = {
  id: string;
  selected: string[];
  other?: string;
};

/** Data resume: user menjawab (sebagian boleh kosong) atau melewati (agent lanjut dgn asumsi). */
export type AskQuestionsResumeData =
  { action: "answered"; answers: AskQuestionAnswer[] } | { action: "skipped" };

/**
 * Label opsi yang sebetulnya penanda "isi sendiri" (mis. "Lainnya", "Lainnya…", "Other", "Tulis
 * sendiri"). Model kadang menambah opsi seperti ini SEKALIGUS set `allowOther` → dobel "Lainnya".
 */
export function isOtherLikeOptionLabel(label: string): boolean {
  const s = label
    .trim()
    .toLowerCase()
    .replace(/[.…\s]+$/, "")
    .trim();
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
  const description =
    typeof rec.description === "string" ? rec.description.trim() : "";
  return description ? { label, description } : { label };
}

/**
 * Normalisasi payload mentah (stream/snapshot Mastra ATAU output model /deep) → `AskQuestion[]`.
 * SATU SSOT dipakai reducer FE (live + re-attach refresh) DAN backend /deep — sebelumnya diduplikasi
 * per app. Item tanpa `prompt` dibuang; `id` fallback `q${i+1}`; opsi "Lainnya"/"Other" dilipat ke
 * `allowOther` (satu chip freeform); tanpa opsi tersisa → pertanyaan freeform murni. `opts.max`
 * membatasi jumlah pertanyaan (mis. /deep = 3).
 */
export function normalizeAskQuestions(
  raw: unknown,
  opts?: { max?: number },
): AskQuestion[] {
  if (!Array.isArray(raw)) return [];
  const out: AskQuestion[] = [];
  raw.forEach((item, i) => {
    if (!item || typeof item !== "object") return;
    const q = item as {
      id?: unknown;
      prompt?: unknown;
      kind?: unknown;
      options?: unknown;
      allowOther?: unknown;
    };
    const prompt = typeof q.prompt === "string" ? q.prompt.trim() : "";
    if (!prompt) return;
    const id =
      typeof q.id === "string" && q.id.trim() ? q.id.trim() : `q${i + 1}`;
    const rawOptions = Array.isArray(q.options)
      ? q.options
          .map(parseAskOption)
          .filter((o): o is AskQuestionOption => o !== null)
      : [];
    const { options, allowOther } = normalizeAskOtherOption(
      rawOptions,
      q.allowOther === true,
    );
    if (options.length === 0) {
      out.push({ id, prompt, kind: "single", options: [], allowOther: true });
    } else {
      out.push({
        id,
        prompt,
        kind: q.kind === "multi" ? "multi" : "single",
        options,
        allowOther,
      });
    }
  });
  return typeof opts?.max === "number" ? out.slice(0, opts.max) : out;
}

/** Apakah satu jawaban terisi (punya pilihan atau teks freeform). */
export function askAnswerIsFilled(
  answer: AskQuestionAnswer | undefined,
): boolean {
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
