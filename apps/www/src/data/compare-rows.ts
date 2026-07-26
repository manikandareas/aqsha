/**
 * Compare-table copy SSOT — used by WhyAqshaSection. Icon keys resolve to
 * components in the section; keep this file free of React imports.
 */

export type CompareStepIconKey =
  | "search"
  | "file-search"
  | "archive"
  | "book-open"
  | "check-circle"
  | "pen"
  | "quote";

export type CompareRow = {
  prompt: string;
  fragmented: {
    label: string;
    detail: string;
    note: string;
  };
  aqsha: {
    label: string;
    steps: { icon: CompareStepIconKey; text: string }[];
    result: string;
  };
};

export const COMPARE_ROWS: readonly CompareRow[] = [
  {
    prompt: "Cariin aku jurnal buat bab 2 skripsiku tentang stunting",
    fragmented: {
      label: "ChatGPT",
      detail:
        "Tentu! Berikut 10 jurnal yang relevan: ‘Determinan Stunting di Indonesia’ (2021), ‘Analisis Faktor Gizi Balita’ (2019)…",
      note: "Judulnya meyakinkan — setelah dicek, ternyata tidak ada."
    },
    aqsha: {
      label: "Aqsha",
      steps: [
        { icon: "search", text: "Mencari jurnal yang relevan dengan topikmu" },
        { icon: "file-search", text: "Ngecek tiap judul dan DOI ke paper aslinya" },
        {
          icon: "archive",
          text: "Nyimpen PDF dan metadata ke proyek skripsimu",
        },
      ],
      result:
        "Beres. 10 paper masuk proyek—semuanya beneran ada dan siap dikutip.",
    },
  },
  {
    prompt: "Rewrite buat jadi lebih manusiawi, bukan AI slop.",
    fragmented: {
      label: "ChatGPT",
      detail:
        "Penelitian ini sangat penting — sebuah langkah strategis untuk masyarakat yang lebih baik.",
      note: "Manusiawi di permukaan, isinya tetap slop.",
    },
    aqsha: {
      label: "Aqsha",
      steps: [
        {
          icon: "book-open",
          text: "Aqsha dilatih untuk berpikir dan menulis akademik",
        },
        {
          icon: "archive",
          text: "Memakai topik, sumber, dan draf dari proyekmu",
        },
        { icon: "pen", text: "Mengusulkan rewrite yang bisa kamu review" },
      ],
      result:
        "Lebih manusiawi, lebih tajam, dan tetap terasa seperti kamu yang menulis.",
    },
  },
  {
    prompt:
      "Referensiku sudah ada di Mendeley dan Zotero. Biar langsung nyambung ke skripsi gimana?",
    fragmented: {
      label: "Mendeley / Zotero",
      detail:
        "Referensi tersimpan rapi di library, tetapi masih terpisah dari proyek dan draf yang sedang kamu tulis.",
      note: "Library rapi, konteks proyek masih terpisah.",
    },
    aqsha: {
      label: "Aqsha",
      steps: [
        { icon: "archive", text: "Impor sitasi dari Mendeley atau Zotero" },
        {
          icon: "book-open",
          text: "Kelola referensi di Citation Manager Aqsha",
        },
        { icon: "quote", text: "Sitasi jadi cepat dan tepat" },
      ],
      result: "Sitasi tetap terhubung ke proyek dan drafmu.",
    },
  },
];
