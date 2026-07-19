"use client";

import type { ComponentType } from "react";

import {
  GraduationCapIcon,
  IdeaIcon,
  PenIcon,
  QuoteIcon,
  ShieldCheckIcon,
  SparklesIcon,
} from "@/components/icons";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from "@/components/ui/navigation-menu";
import type { NavIconKey, NavItem, NavMenu } from "@/lib/marketing/nav";
import { navTree } from "@/lib/marketing/nav";
import { cn } from "@/lib/utils";

const NAV_ICONS: Record<
  NavIconKey,
  ComponentType<{ size?: number; className?: string }>
> = {
  sparkles: SparklesIcon,
  "shield-check": ShieldCheckIcon,
  quote: QuoteIcon,
  pen: PenIcon,
  "graduation-cap": GraduationCapIcon,
  idea: IdeaIcon,
};

/** Satu item panel: ikon + judul + deskripsi. */
function PanelItem({ item }: { item: NavItem }) {
  const Icon = item.icon ? NAV_ICONS[item.icon] : null;
  return (
    <NavigationMenuLink asChild>
      <a
        href={item.href}
        className="group/item flex items-start gap-3 rounded-xl p-3 transition-colors hover:bg-muted"
      >
        {Icon ? (
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon size={18} />
          </span>
        ) : null}
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-foreground">
            {item.label}
          </span>
          {item.description ? (
            <span className="mt-0.5 block text-[13px] leading-5 text-muted-foreground">
              {item.description}
            </span>
          ) : null}
        </span>
      </a>
    </NavigationMenuLink>
  );
}

/** Baris link sekunder di dasar panel (ala footer mega-menu Tines). */
function PanelFooter({ links }: { links: NonNullable<NavMenu["footerLinks"]> }) {
  return (
    <div className="flex items-center gap-1 border-t border-border/70 px-2 py-2">
      {links.map((link) => (
        <NavigationMenuLink asChild key={`${link.href}-${link.label}`}>
          <a
            href={link.href}
            className="rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {link.label}
          </a>
        </NavigationMenuLink>
      ))}
    </div>
  );
}

function MenuPanel({ menu }: { menu: NavMenu }) {
  return (
    <div className="md:w-[400px]">
      <ul className="grid gap-0.5">
        {menu.items.map((item) => (
          <li key={`${item.href}-${item.label}`}>
            <PanelItem item={item} />
          </li>
        ))}
      </ul>
      {menu.footerLinks?.length ? (
        <div className="mt-2">
          <PanelFooter links={menu.footerLinks} />
        </div>
      ) : null}
    </div>
  );
}

/**
 * MegaNav — kapsul nav desktop di atas primitive `navigation-menu`. Panel
 * selalu solid (`bg-background`) supaya terbaca di atas latar apa pun.
 */
export function MegaNav() {
  const triggerColor =
    "text-foreground/80 hover:bg-foreground/[0.07] hover:text-foreground data-[state=open]:bg-foreground/[0.07] data-[state=open]:text-foreground";

  return (
    <NavigationMenu delayDuration={120} skipDelayDuration={400}>
      <NavigationMenuList className="gap-0.5 rounded-full bg-foreground/[0.05] px-1.5 py-1.5">
        {navTree.map((item) =>
          item.type === "link" ? (
            <NavigationMenuItem key={item.label}>
              <NavigationMenuLink asChild>
                <a
                  href={item.href}
                  className={cn(navigationMenuTriggerStyle(), triggerColor)}
                >
                  {item.label}
                </a>
              </NavigationMenuLink>
            </NavigationMenuItem>
          ) : (
            <NavigationMenuItem key={item.label}>
              <NavigationMenuTrigger className={triggerColor}>
                {item.label}
              </NavigationMenuTrigger>
              <NavigationMenuContent>
                <MenuPanel menu={item} />
              </NavigationMenuContent>
            </NavigationMenuItem>
          ),
        )}
      </NavigationMenuList>
    </NavigationMenu>
  );
}
