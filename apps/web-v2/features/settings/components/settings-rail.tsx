"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CreditCardIcon, GaugeIcon, UserRoundIcon } from "@aqsha/ui/icons";

const ITEMS = [
  { href: "/app/settings", label: "Ringkasan", icon: GaugeIcon, exact: true },
  { href: "/app/settings/usage-billing", label: "Penggunaan & tagihan", icon: CreditCardIcon, exact: false },
  { href: "/app/settings/account", label: "Akun", icon: UserRoundIcon, exact: false },
];

export function SettingsRail() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto md:w-56 md:flex-col md:overflow-visible">
      {ITEMS.map((item) => {
        const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm whitespace-nowrap transition-colors ${
              active ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:bg-muted/60"
            }`}
          >
            <Icon className="size-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
