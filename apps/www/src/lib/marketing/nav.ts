/**
 * Marketing nav tree — single source of truth for desktop mega-menu and
 * mobile accordion. Feature items derive identity from `data/features.ts`;
 * persona / pricing / content links stay here. Dedicated pages
 * (`/fitur/<slug>`, `/untuk/<slug>`) only need href edits.
 */

import {
  FEATURE_NAV_KEYS,
  FEATURES,
  featurePath,
  type FeatureKey,
} from "@/data/features";

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

function featureNavItem(key: FeatureKey): NavItem {
  const feature = FEATURES[key];
  return {
    href: featurePath(feature.id),
    label: feature.navLabel,
    description: feature.navDescription,
    icon: feature.navIcon,
  };
}

export const navTree: NavTopItem[] = [
  {
    type: "menu",
    label: "Cara Aqsha bekerja",
    items: FEATURE_NAV_KEYS.map(featureNavItem),
    footerLinks: [
      { href: "/#cara-kerja", label: "Alur penulisan" },
      { href: "/#bandingin", label: "Kenapa berbasis proyek" },
    ],
  },
  { type: "link", label: "Mengapa Aqsha", href: "/#cerita-pembuat" },
  { type: "link", label: "Harga", href: "/#pricing" },
  { type: "link", label: "Blog", href: "/blog" },
  { type: "link", label: "Changelog", href: "/changelog" },
];
