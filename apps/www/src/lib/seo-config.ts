/**
 * SEO config — marketing site (apps/www).
 */

export const siteUrl = (
  import.meta.env.PUBLIC_SITE_URL ?? "https://aqshara.com"
).replace(/\/$/, "");

export const siteName = "Aqsha";
export const orgLegalName = "Aqsha";
export const defaultDescription =
  "Asisten AI untuk skripsi, tesis, dan paper. Aqsha mengecek tiap sumber ke paper aslinya — cari jurnal, menulis bareng Astra, semua di satu tempat.";
export const locale = "id_ID";
export const htmlLang = "id";
export const contactEmail = "vitoandareas15@gmail.com";

export const social = {
  twitter: "",
  instagram: "",
  linkedin: "",
  tiktok: "",
  youtube: "",
} as const;

export const sameAs = [
  social.twitter ? `https://x.com/${social.twitter}` : "",
  social.instagram,
  social.linkedin,
  social.tiktok,
  social.youtube,
].filter(Boolean);

export const verification = {
  google: "",
  bing: "",
};

export const themeColor = "#0a0a0a";
export const backgroundColor = "#ffffff";

export const ogImage = {
  title: "Asisten AI buat skripsi, tesis & paper",
  subtitle: "Sumber yang nggak ngarang.",
};
