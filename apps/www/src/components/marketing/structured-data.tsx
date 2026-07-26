import { PLAN_CATALOG, PUBLIC_PLAN_KEYS } from "@/data/plan-catalog";
import {
  contactEmail,
  defaultDescription,
  orgLegalName,
  sameAs,
  siteName,
  siteUrl,
} from "@/lib/seo-config";
import { faqItems } from "@/components/marketing/faq-data";

// ponytail: derive harga dari PLAN_CATALOG (SSOT) — jangan duplikat angka.
const paidPrices = PUBLIC_PLAN_KEYS.map((k) => PLAN_CATALOG[k].monthlyPriceIdr);
const logoUrl = `${siteUrl}/web-app-manifest-512x512.png`;

const organization = {
  "@type": "Organization",
  "@id": `${siteUrl}/#organization`,
  name: orgLegalName,
  url: siteUrl,
  logo: logoUrl,
  email: contactEmail,
  ...(sameAs.length > 0 ? { sameAs } : {}),
};

const website = {
  "@type": "WebSite",
  "@id": `${siteUrl}/#website`,
  name: siteName,
  url: siteUrl,
  inLanguage: "id-ID",
  publisher: { "@id": `${siteUrl}/#organization` },
};

const softwareApplication = {
  "@type": "SoftwareApplication",
  name: siteName,
  description: defaultDescription,
  applicationCategory: "WritingApplication",
  operatingSystem: "Web",
  url: siteUrl,
  offers: {
    "@type": "AggregateOffer",
    priceCurrency: "IDR",
    lowPrice: Math.min(...paidPrices),
    highPrice: Math.max(...paidPrices),
    offerCount: paidPrices.length,
  },
};

const faqPage = {
  "@type": "FAQPage",
  "@id": `${siteUrl}/#faq`,
  mainEntity: faqItems.map((item) => ({
    "@type": "Question",
    name: item.q,
    acceptedAnswer: { "@type": "Answer", text: item.a },
  })),
};

const graph = {
  "@context": "https://schema.org",
  "@graph": [organization, website, softwareApplication, faqPage],
};

/** JSON-LD identitas + FAQ untuk landing. Server Component, tanpa library. */
export function StructuredData() {
  return (
    <script
      type="application/ld+json"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD dari data internal statis.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(graph) }}
    />
  );
}
