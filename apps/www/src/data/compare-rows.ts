/**
 * Compare-table copy SSOT — used by WhyAqshaSection. Icon keys resolve to
 * components in the section; keep this file free of React imports.
 */

export type CompareStepIconKey =
  | "search"
  | "archive"
  | "book-open"
  | "check-circle"
  | "pen"
  | "quote";

export type CompareRow = {
  prompt: string;
  fragmented: {
    label: "Alur terpencar";
    detail: string;
    note: string;
  };
  aqsha: {
    label: "Di Aqsha";
    steps: { icon: CompareStepIconKey; text: string }[];
    result: string;
  };
};

export const COMPARE_ROWS: readonly CompareRow[] = [
  {
    prompt: "Mulai menulis karya tulis baru",
    fragmented: {
      label: "Alur terpencar",
      detail:
        "Topik, catatan, dokumen, dan percakapan AI dimulai di tempat yang berbeda.",
      note: "konteksnya mudah putus di tengah jalan",
    },
    aqsha: {
      label: "Di Aqsha",
      steps: [
        { icon: "pen", text: "Buat proyek sesuai jenis karya tulis" },
        {
          icon: "archive",
          text: "Simpan topik, tenggat, dan bahan pendukung di satu rumah",
        },
        { icon: "book-open", text: "Mulai dari dokumen dan outline yang sama" },
      ],
      result:
        "Kamu mulai dari karya yang ingin diselesaikan, bukan dari tab kosong.",
    },
  },
  {
    prompt: "Menemukan sumber untuk bab berikutnya",
    fragmented: {
      label: "Alur terpencar",
      detail:
        "Paper tersimpan di banyak tab, metadata di satu tempat, dan daftar pustaka di tempat lain.",
      note: "sumber sulit kembali ke draf yang membutuhkannya",
    },
    aqsha: {
      label: "Di Aqsha",
      steps: [
        { icon: "search", text: "Jelajahi literatur secara paper-first" },
        { icon: "archive", text: "Simpan sitasi ke perpustakaan akun" },
        { icon: "quote", text: "Tautkan referensi ke proyek aktif" },
      ],
      result:
        "Sumber tetap dekat dengan proyek dan draf tempat ia akan dipakai.",
    },
  },
  {
    prompt: "Meminta bantuan untuk memperbaiki bagian draf",
    fragmented: {
      label: "Alur terpencar",
      detail:
        "Saran AI datang sebagai teks baru tanpa hubungan yang jelas dengan dokumen yang sedang kamu kerjakan.",
      note: "perubahan penting mudah masuk tanpa sempat ditinjau",
    },
    aqsha: {
      label: "Di Aqsha",
      steps: [
        { icon: "book-open", text: "Tandai bagian yang perlu dibantu" },
        {
          icon: "pen",
          text: "Astra menyusun proposal perubahan dalam konteks proyek",
        },
        { icon: "check-circle", text: "Review dan terima hunk yang kamu setujui" },
      ],
      result:
        "Astra membantu menggerakkan draf, sementara keputusan akhirnya tetap di tanganmu.",
    },
  },
];
