import {
  CreditCardIcon,
  DatabaseIcon,
  GaugeIcon,
  PaletteIcon,
  ShieldIcon,
  UserRoundIcon,
} from "lucide-react";

export type SettingsKey =
  | "overview"
  | "account"
  | "appearance"
  | "sources"
  | "usage-billing"
  | "security";

export type SettingsMenuItem = {
  key: SettingsKey;
  href: string;
  label: string;
  description: string;
  group: "Personal" | "Research";
  icon: typeof GaugeIcon;
};

export const settingsMenu: SettingsMenuItem[] = [
  {
    key: "overview",
    href: "/settings/overview",
    label: "Overview",
    description: "Rangkuman akun dan aktivitas",
    group: "Personal",
    icon: GaugeIcon,
  },
  {
    key: "account",
    href: "/settings/account",
    label: "Account",
    description: "Identitas readonly",
    group: "Personal",
    icon: UserRoundIcon,
  },
  {
    key: "appearance",
    href: "/settings/appearance",
    label: "Appearance",
    description: "Light, dark, atau system",
    group: "Personal",
    icon: PaletteIcon,
  },
  {
    key: "sources",
    href: "/settings/sources",
    label: "Sources",
    description: "Library dan readiness",
    group: "Research",
    icon: DatabaseIcon,
  },
  {
    key: "usage-billing",
    href: "/settings/usage-billing",
    label: "Usage & Billing",
    description: "Credits, plan, dan portal",
    group: "Research",
    icon: CreditCardIcon,
  },
  {
    key: "security",
    href: "/settings/security",
    label: "Security",
    description: "Session dan sign out",
    group: "Research",
    icon: ShieldIcon,
  },
];

export function settingsItemForPath(pathname: string) {
  return (
    settingsMenu.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`)) ??
    settingsMenu[0]
  );
}
