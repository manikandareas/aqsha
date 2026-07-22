// Prompt commands — SSOT di sini supaya client (web) DAN runtime agent pakai
// data yang sama. Pure, zero-dep, tetap SATU FILE (constraint bundle konsumen).
// /deep aktif untuk deep research: expand jadi instruksi riset mendalam; gate
// billing/cap = plan-gate `/deep` + send-status?feature.
// ---------------------------------------------------------------------------

/** Command id `/deep` dipakai composer untuk pre-check send-status deep-aware. */
export const DEEP_COMMAND_ID = "deep";

export type PromptCommand = {
  id: string;
  slug: string;
  label: string;
  description: string;
  group:
    | "Metodologi"
    | "Olah Data"
    | "Penulisan Bab"
    | "Literatur"
    | "Bahasa & Sitasi"
    | "Pertahanan"
    | "Workspace";
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
    keywords: [
      "kuantitatif",
      "quantitative",
      "variabel",
      "hipotesis",
      "statistik",
      "sampel",
      "instrumen",
      "metodologi",
    ],
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
    description:
      "Fenomenologi/studi kasus, informan, koding tematik, triangulasi.",
    group: "Metodologi",
    aliases: ["/kuali"],
    keywords: [
      "kualitatif",
      "qualitative",
      "fenomenologi",
      "studi kasus",
      "informan",
      "koding tematik",
      "triangulasi",
    ],
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
    description:
      "Padukan pendekatan kuantitatif dan kualitatif secara koheren.",
    group: "Metodologi",
    aliases: ["/mixed", "/mixedmethod"],
    keywords: [
      "campuran",
      "mixed method",
      "mixed methods",
      "kuantitatif kualitatif",
      "konvergen",
      "sekuensial",
    ],
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
    keywords: [
      "rnd",
      "r&d",
      "research and development",
      "pengembangan",
      "addie",
      "4d",
      "borg gall",
      "produk",
    ],
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
  // --- Olah Data ----------------------------------------------------------
  {
    id: "analisis",
    slug: "/analisis",
    label: "Analisis data (statistik)",
    description:
      "Olah data kuesioner/SPSS: profil → uji → tabel & interpretasi Bab 4.",
    group: "Olah Data",
    aliases: ["/olahdata", "/spss", "/statistik", "/uji"],
    keywords: [
      "analisis data",
      "olah data",
      "statistik",
      "spss",
      "uji",
      "validitas",
      "reliabilitas",
      "normalitas",
      "regresi",
      "korelasi",
      "kuesioner",
      "likert",
    ],
    placeholder:
      "Lampirkan dataset (CSV/XLSX) dan tulis uji yang kamu butuhkan...",
    buildPrompt: (argument) =>
      [
        "Bantu ANALISIS DATA statistik untuk skripsi berikut. Alur wajib:",
        "1. Profil dulu dataset yang dilampirkan (`profile_dataset`) — ringkas kolom, tipe, deteksi skala Likert, dan data kosong; klarifikasi mapping variabel bila ambigu.",
        "2. Sarankan/jalankan pipeline uji yang relevan HANYA dari katalog (`list_analyses` → `run_analysis`) — untuk kuesioner Likert biasanya validitas → reliabilitas → normalitas → asumsi klasik → regresi/korelasi/hipotesis.",
        "3. Semua angka, tabel, dan kesimpulan lolos/tidak WAJIB berasal dari hasil tool (jangan menghitung sendiri). Tulis interpretasi bahasa Indonesia bergaya Bab 4, dan sisipkan penanda hasil `{{stats:...}}` yang dikembalikan tool tepat di tempat tabel & figur harus muncul.",
        "",
        "Jika belum ada dataset terlampir, minta pengguna mengunggah file CSV/XLSX terlebih dahulu sebelum menjalankan uji apa pun.",
        "",
        withInput(
          argument,
          "[Jelaskan uji/analisis yang dibutuhkan, atau lampirkan datasetmu]",
        ),
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
    keywords: [
      "latar belakang",
      "background",
      "pendahuluan",
      "urgensi",
      "gap",
      "fenomena",
    ],
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
    description:
      "Turunkan rumusan dan pertanyaan penelitian dari latar belakang.",
    group: "Penulisan Bab",
    aliases: ["/rumusan", "/rq", "/research-question"],
    keywords: [
      "rumusan masalah",
      "pertanyaan penelitian",
      "research question",
      "rq",
      "masalah",
    ],
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
    keywords: [
      "kerangka teori",
      "kerangka berpikir",
      "landasan teori",
      "outline",
      "theoretical framework",
    ],
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
    description:
      "Interpretasi temuan, kaitkan dengan teori dan penelitian lain.",
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
    keywords: [
      "gap",
      "research gap",
      "celah riset",
      "kebaruan",
      "novelty",
      "library",
    ],
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
    description:
      "Tabel Penulis (Tahun), Metode, Sampel, Temuan, Relevansi dari library.",
    group: "Literatur",
    aliases: ["/matrix", "/sintesis"],
    keywords: [
      "matriks",
      "matrix",
      "sintesis",
      "literature matrix",
      "tabel",
      "review",
      "library",
    ],
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
    keywords: [
      "penelitian terdahulu",
      "tinjauan pustaka",
      "kajian pustaka",
      "literature review",
      "state of the art",
    ],
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
    keywords: [
      "deep",
      "deep research",
      "riset mendalam",
      "penelitian",
      "tinjauan",
      "verifikasi sitasi",
      "literatur",
    ],
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
    keywords: [
      "akademik",
      "gaya akademik",
      "ilmiah",
      "kalimat efektif",
      "baku",
      "formal",
    ],
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
    keywords: [
      "sitasi",
      "citation",
      "apa",
      "daftar pustaka",
      "referensi",
      "bibliografi",
    ],
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
    keywords: [
      "parafrase",
      "paraphrase",
      "tulis ulang",
      "rewrite",
      "sitasi",
      "kutipan",
    ],
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
    description:
      "Perluas paragraf atau gagasan dengan batas klaim yang eksplisit.",
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
    keywords: [
      "sidang",
      "ujian",
      "penguji",
      "defense",
      "pertanyaan",
      "simulasi",
    ],
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
    keywords: [
      "reviewer",
      "review",
      "reviu",
      "kritik",
      "pembimbing",
      "revisi",
      "koreksi",
    ],
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
    description:
      "Buat, perbarui, atau hapus artifact workspace dengan konfirmasi.",
    group: "Workspace",
    aliases: [],
    keywords: ["artifact", "artefak", "dokumen", "workspace", "markdown"],
    placeholder:
      "Contoh: cerita rakyat, perbarui outline tesis, hapus draft lama...",
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
    keywords: [
      "workspace",
      "ruang kerja",
      "rename",
      "ganti nama",
      "buat workspace",
    ],
    placeholder:
      "Contoh: buat workspace Tesis 2026, rename workspace Draft jadi Final...",
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

export function getPromptCommand(
  commandId: string | undefined | null,
): PromptCommand | null {
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
export function matchPromptCommandInContent(
  content: string,
): PromptCommand | null {
  const trimmed = content.trim();
  return (
    promptCommands.find((command) =>
      commandSlugs(command).some(
        (slug) =>
          trimmed === slug ||
          trimmed.startsWith(`${slug} `) ||
          trimmed.startsWith(`${slug}\n`),
      ),
    ) ?? null
  );
}

/** Strip a leading command slug/alias, returning the remaining argument text. */
export function stripPromptCommandSlug(
  content: string,
  command: PromptCommand,
): string {
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
export function filterPromptCommandsBySlashQuery(
  query: string,
): PromptCommand[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [...promptCommands];
  return promptCommands.filter((command) => {
    const candidates = [
      command.slug,
      ...command.aliases,
      command.label,
      ...command.keywords,
    ];
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
 * stripped before building the argument, so it is never duplicated. `/deep`
 * expands like any command — it tells the model to use the deep-research
 * skill; the billing/cap gate lives in `propose_research_plan`, not here.
 */
export function resolveCommandDispatch(
  content: string,
  commandId?: string | null,
): CommandDispatch {
  const displayText = content.trim();
  const command =
    getPromptCommand(commandId) ?? matchPromptCommandInContent(displayText);
  if (!command) return { displayText, dispatchPrompt: displayText };
  const argument = stripPromptCommandSlug(displayText, command);
  return { displayText, dispatchPrompt: command.buildPrompt(argument) };
}

/** Lookup command by exact slug or alias (mis. `/kuanti` → command `kuantitatif`). */
export function getPromptCommandBySlug(slug: string): PromptCommand | null {
  return (
    promptCommands.find(
      (command) =>
        command.slug === slug ||
        command.aliases.some((alias) => alias === slug),
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
    if (index > lastIndex)
      segments.push({ type: "text", value: text.slice(lastIndex, index) });
    segments.push({ type: "command", command, matched });
    lastIndex = index + matched.length;
  }
  if (lastIndex < text.length)
    segments.push({ type: "text", value: text.slice(lastIndex) });
  return segments;
}

/**
 * Tier agen Astra — kontrak bersama web + agent (FE selektor, route agent-scoped, billing, runtime
 * model/reasoning/memory). SATU definisi di sini; web (`mastra-client`/`ComposerAgentKind`) dan agent
 * (`tool-context`) mengimpornya, bukan menyalin union-nya.
 */
