"use client";

import { CheckIcon, MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";
import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const themeOptions = [
  { key: "light", label: "Light", icon: SunIcon },
  { key: "dark", label: "Dark", icon: MoonIcon },
  { key: "system", label: "System", icon: MonitorIcon },
] as const;

type ThemeKey = (typeof themeOptions)[number]["key"];

function getThemeOption(key: ThemeKey) {
  return themeOptions.find((option) => option.key === key) ?? themeOptions[2];
}

const themeMenuItemClass =
  "h-9 gap-2 rounded-[8px] px-2 text-[13px] font-medium text-popover-foreground [&_svg]:size-4 [&_svg]:text-muted-foreground";

export function ThemeMenuSub({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const current = (theme ?? "system") as ThemeKey;
  const CurrentIcon = getThemeOption(current).icon;

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger
        className={cn(
          themeMenuItemClass,
          "w-full cursor-default [&>svg:last-child]:hidden",
          className,
        )}
      >
        <CurrentIcon />
        <span className="truncate">Theme</span>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent
        side="right"
        align="start"
        className="min-w-36 rounded-[12px] p-1.5"
      >
        {themeOptions.map((option) => {
          const Icon = option.icon;
          const active = current === option.key;
          return (
            <DropdownMenuItem
              key={option.key}
              onSelect={() => setTheme(option.key)}
              className={themeMenuItemClass}
            >
              <Icon className={cn(active && "text-primary")} />
              <span className={cn("truncate", active && "font-semibold text-primary")}>
                {option.label}
              </span>
              {active ? <CheckIcon className="ml-auto size-3.5 text-primary" /> : null}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

export function ThemeToggle({
  className,
  variant = "outline",
  size = "icon",
}: {
  className?: string;
  variant?: ComponentProps<typeof Button>["variant"];
  size?: ComponentProps<typeof Button>["size"];
}) {
  const { setTheme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={variant} size={size} className={className}>
          <SunIcon className="h-[1.2rem] w-[1.2rem] scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
          <MoonIcon className="absolute h-[1.2rem] w-[1.2rem] scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
          <span className="sr-only">Toggle theme</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="right">
        <DropdownMenuItem onClick={() => setTheme("light")}>Light</DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")}>Dark</DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("system")}>System</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
