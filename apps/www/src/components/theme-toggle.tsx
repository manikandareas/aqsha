"use client";

import { MoonIcon, SunIcon } from "@/components/icons";
import { cn } from "@/lib/utils";

/** Must match the anti-flash init script in BaseLayout.astro. */
const STORAGE_KEY = "aqsha-www-theme";

function toggleTheme() {
  const dark = !document.documentElement.classList.contains("dark");
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
  try {
    localStorage.setItem(STORAGE_KEY, dark ? "dark" : "light");
  } catch {
    /* private mode — theme just won't persist */
  }
}

/**
 * ThemeToggle — light/dark switch for the marketing chrome. Stateless on
 * purpose: which icon/label shows is driven purely by the `.dark` class via
 * CSS variants, so there is no hydration mismatch and every instance (header,
 * footer, mobile nav) stays in sync for free when any of them flips the class.
 */
export function ThemeToggle({
  variant = "icon",
  className,
}: {
  variant?: "icon" | "labeled";
  className?: string;
}) {
  if (variant === "labeled") {
    return (
      <button
        type="button"
        onClick={toggleTheme}
        aria-label="Ganti mode tampilan"
        className={cn(
          "inline-flex items-center gap-2 rounded-full border-2 border-border bg-background px-3.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground",
          className,
        )}
      >
        {/* Icon + label both name the TARGET mode, not the current one. */}
        <MoonIcon size={15} aria-hidden className="dark:hidden" />
        <SunIcon size={15} aria-hidden className="hidden dark:block" />
        <span className="dark:hidden">Mode gelap</span>
        <span className="hidden dark:inline">Mode terang</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label="Ganti mode tampilan"
      className={cn(
        "inline-flex h-9 w-9 items-center justify-center rounded-full bg-foreground/[0.05] text-foreground/75 transition-colors hover:bg-foreground/[0.08] hover:text-foreground",
        className,
      )}
    >
      <MoonIcon size={17} aria-hidden className="dark:hidden" />
      <SunIcon size={17} aria-hidden className="hidden dark:block" />
    </button>
  );
}
