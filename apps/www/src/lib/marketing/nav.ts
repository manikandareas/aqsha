/**
 * Marketing nav tree — single source of truth for desktop mega-menu and
 * mobile accordion. Href masih menunjuk anchor landing; saat halaman
 * dedicated (/fitur/<slug>, /untuk/<slug>) jadi, cukup ganti href di sini.
 */

/** Icon keys — dipetakan ke komponen di `mega-nav.tsx`. */
export type NavIconKey =
  | "sparkles"
  | "shield-check"
  | "quote"
  | "pen"
  | "graduation-cap"
  | "idea";

export type NavItem = {
  href: string;
  label: string;
  description?: string;
  icon?: NavIconKey;
};

export type NavMenu = {
  type: "menu";
  label: string;
  items: NavItem[];
  /** Link kecil di baris bawah panel. */
  footerLinks?: { href: string; label: string }[];
};

export type NavLink = {
  type: "link";
  label: string;
  href: string;
};

export type NavTopItem = NavMenu | NavLink;

/** Desktop capsule + mobile sheet share this breakpoint (`lg` = 1024px). */
export const NAV_DESKTOP_MQ = "(min-width: 1024px)";

/** Urutan = prioritas: fitur dulu, lalu persona, harga, baru konten. */
export const navTree: NavTopItem[] = [
  {
    type: "menu",
    label: "Fitur Aqsha",
    items: [
      {
        href: "/#fitur-astra",
        label: "Astra AI",
        description: "Chat riset + deep research yang nunjukin prosesnya.",
        icon: "sparkles",
      },
      {
        href: "/#fitur-provenance",
        label: "Verifikasi sumber",
        description: "Tiap klaim dicek balik ke paper aslinya.",
        icon: "shield-check",
      },
      {
        href: "/#fitur-citations",
        label: "Manajer sitasi",
        description: "Sitasi rapi otomatis, sinkron Mendeley & Zotero.",
        icon: "quote",
      },
      {
        href: "/#fitur-workspace",
        label: "Workspace penulisan",
        description: "Nulis dan kelola karya tulis di satu tempat.",
        icon: "pen",
      },
    ],
    footerLinks: [
      { href: "/#cara-kerja", label: "Cara kerja" },
      { href: "/#bandingin", label: "Bandingin Aqsha" },
    ],
  },
  {
    type: "menu",
    label: "Untuk siapa",
    items: [
      {
        href: "/#buat-siapa",
        label: "Mahasiswa tingkat akhir",
        description: "Skripsi dan tugas akhir yang aman pas sidang.",
        icon: "graduation-cap",
      },
      {
        href: "/#buat-siapa",
        label: "Peneliti & dosen",
        description: "Tesis, disertasi, sampai paper publikasi.",
        icon: "idea",
      },
    ],
  },
  { type: "link", label: "Harga", href: "/#pricing" },
  { type: "link", label: "Blog", href: "/blog" },
  { type: "link", label: "Changelog", href: "/changelog" },
];
