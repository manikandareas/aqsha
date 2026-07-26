/**
 * SEO config — marketing site (apps/www).
 */

export const siteUrl = (
  import.meta.env.PUBLIC_SITE_URL ?? "https://aqshara.com"
).replace(/\/$/, "");

export const siteName = "Aqsha";
export const orgLegalName = "Aqsha";
export const defaultDescription =
  "Aqsha adalah workspace riset dan penulisan untuk proyek karya tulis: dokumen Typst, referensi terhubung, dan Astra yang mengusulkan perubahan untuk kamu review.";
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
  title: "Aqsha untuk riset dan karya tulis",
  subtitle: "Proyek, sumber, dan draf yang tetap terhubung.",
};
