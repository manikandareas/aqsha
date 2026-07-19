import { redirect } from "next/navigation";

/**
 * Canonical marketing landing is `@aqsha/www` (aqshara.com).
 * Do not resurrect the Next marketing page — edit apps/www instead.
 */
export default function PublicLandingPage() {
  redirect(process.env.NEXT_PUBLIC_SITE_URL ?? "https://aqshara.com");
}
