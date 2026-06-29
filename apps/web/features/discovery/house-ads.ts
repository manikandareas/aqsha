// House-ad konfigurabel untuk feed Explore (slot promo produk sendiri, bukan iklan
// pihak ketiga). Tambah/ubah kampanye cukup di array ini — HouseAdBanner merender
// semua varian, dan ExploreFindings menyelipkannya di antara blok feed. Copy sentence
// case (lihat brand voice). `href` internal → next/link; set `external` untuk <a>.

export type HouseAdAccent = "mint" | "lavender" | "coral";

export type HouseAd = {
  id: string;
  eyebrow: string;
  title: string;
  body: string;
  ctaLabel: string;
  href: string;
  accent: HouseAdAccent;
  // Gambar kampanye (path /public atau URL). Owner ganti dgn creative asli. Bila
  // kosong, HouseAdBanner menampilkan panel ikon accent sebagai gantinya.
  image?: string;
  external?: boolean;
};

export const HOUSE_ADS: HouseAd[] = [
  {
    id: "astra-deep",
    eyebrow: "Astra · deep research",
    title: "Lagi penasaran soal satu topik?",
    body: "Astra menjelajah banyak sumber sekaligus lalu menyusun rangkuman ber-sitasi — cukup dari satu pertanyaan.",
    ctaLabel: "Coba deep research",
    href: "/app/threads",
    accent: "mint",
    image: "/pro-agent.png",
  },
  {
    id: "aqsha-app",
    eyebrow: "Aqsha",
    title: "Simpan sekarang, teliti nanti",
    body: "Kumpulkan paper & berita ke workspace, lanjut baca dan tanya Astra kapan pun kamu siap.",
    ctaLabel: "Buka workspace",
    href: "/app",
    accent: "lavender",
    image: "/general-agent.png",
  },
];
