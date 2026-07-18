/** Absolute URL helper for product-app auth CTAs (app.aqshara.com). */
export function appUrl(path: string): string {
  const base = (
    import.meta.env.PUBLIC_APP_URL ?? "https://app.aqshara.com"
  ).replace(/\/$/, "");
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalized}`;
}

export function siteUrl(): string {
  return (
    import.meta.env.PUBLIC_SITE_URL ?? "https://aqshara.com"
  ).replace(/\/$/, "");
}
