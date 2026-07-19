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
  | "flag"
  | "history"
  | "pen"
  | "file-exported";

export type CompareRow = {
  prompt: string;
  competitor: string;
  competitorReply: string;
  competitorNote: string;
  steps: { icon: CompareStepIconKey; text: string }[];
  result: string;
};

export const COMPARE_ROWS: readonly CompareRow[] = [
  {
    prompt: "Cariin aku jurnal buat bab 2 skripsiku tentang stunting",
    competitor: "ChatGPT",
    competitorReply:
      "Tentu! Berikut 10 jurnal yang relevan: “Determinan Stunting di Indonesia” (2021), “Analisis Faktor Gizi Balita” (2019)…",
    competitorNote: "judulnya meyakinkan — sebagian nggak pernah ada",
    steps: [
      { icon: "search", text: "Nyari di OpenAlex, arXiv, dan Crossref" },
      { icon: "file-search", text: "Ngecek tiap judul dan DOI ke paper aslinya" },
      { icon: "archive", text: "Nyimpen PDF dan metadata ke workspace-mu" },
    ],
    result:
      "Beres. 10 paper masuk workspace — semuanya beneran ada dan siap dikutip.",
  },
  {
    prompt: "Cek kutipan di draf ini masih nyambung sama sumbernya nggak",
    competitor: "Perplexity",
    competitorReply:
      "Kutipan Anda tampak sudah sesuai dengan sumber yang dirujuk.",
    competitorNote: "padahal paper aslinya nggak pernah dibuka",
    steps: [
      { icon: "book-open", text: "Buka isi asli tiap paper yang kamu kutip" },
      { icon: "check-circle", text: "Cocokin kalimatmu ke bagian yang dirujuk" },
      { icon: "flag", text: "Nandain kutipan yang meragukan" },
    ],
    result:
      "12 kutipan aman, 2 diflag — lengkap sama letak halamannya biar kamu cek sendiri.",
  },
  {
    prompt: "Tulisan jujurku dicap buatan AI — gimana cara buktiinnya?",
    competitor: "ChatGPT",
    competitorReply:
      "Maaf, saya tidak dapat memverifikasi siapa yang menulis teks tersebut.",
    competitorNote: "nggak ada jejak, nggak ada yang bisa dibuktiin",
    steps: [
      { icon: "history", text: "Ngerekam tiap langkah nulismu dari awal" },
      {
        icon: "pen",
        text: "Nyatet kapan kamu nulis, kapan pakai AI, kapan nyitasi",
      },
      { icon: "file-exported", text: "Nyiapin jejak proses buat ditunjukkin" },
    ],
    result:
      "Kamu pegang bukti proses dari draf pertama sampai final — bukan cuma hasil akhir.",
  },
];
