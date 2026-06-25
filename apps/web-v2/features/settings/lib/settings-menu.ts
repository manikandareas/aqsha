import {
  CreditCardIcon,
  GaugeIcon,
  PaletteIcon,
  ShieldIcon,
  UserRoundIcon,
} from "@aqsha/ui/icons";

export type SettingsKey =
  | "overview"
  | "account"
  | "appearance"
  | "usage-billing"
  | "security";

export type SettingsMenuItem = {
  key: SettingsKey;
  href: string;
  label: string;
  description: string;
  group: "Pribadi" | "Riset";
  icon: typeof GaugeIcon;
};

export const settingsMenu: SettingsMenuItem[] = [
  {
    key: "overview",
    href: "/app/settings/overview",
    label: "Ringkasan",
    description: "Rangkuman akun dan aktivitas riset.",
    group: "Pribadi",
    icon: GaugeIcon,
  },
  {
    key: "account",
    href: "/app/settings/account",
    label: "Akun",
    description: "Profil dan identitas yang dipakai di Aqsha.",
    group: "Pribadi",
    icon: UserRoundIcon,
  },
  {
    key: "appearance",
    href: "/app/settings/appearance",
    label: "Tampilan",
    description: "Tema terang, gelap, atau mengikuti sistem.",
    group: "Pribadi",
    icon: PaletteIcon,
  },
  {
    key: "usage-billing",
    href: "/app/settings/usage-billing",
    label: "Penggunaan & tagihan",
    description: "Kredit, paket, dan portal pembayaran.",
    group: "Riset",
    icon: CreditCardIcon,
  },
  {
    key: "security",
    href: "/app/settings/security",
    label: "Keamanan",
    description: "Sesi aktif dan keluar dari perangkat ini.",
    group: "Riset",
    icon: ShieldIcon,
  },
];

export function settingsItemForPath(pathname: string) {
  return (
    settingsMenu.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`)) ??
    settingsMenu[0]
  );
}
