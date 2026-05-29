import { cn } from "@/lib/utils";

export function BrandLogoIcon({ className }: { className?: string }) {
  return (
    <svg
      className={cn("size-7 text-mint shrink-0 fill-current", className)}
      viewBox="0 0 24 24"
    >
      <path d="M11.5 2C6.25 2 2 6.25 2 11.5c0 1.8.5 3.5 1.4 5l8.1-14.5z" opacity="0.9" />
      <path d="M12.5 22c5.25 0 9.5-4.25 9.5-9.5 0-1.8-.5-3.5-1.4-5L12.5 22z" />
      <path
        d="M12 8.5c0 1-.5 1.7-1.3 2 .8.3 1.3 1 1.3 2 0-1 .5-1.7 1.3-2-.8-.3-1.3-1-1.3-2z"
        className="text-card-foreground dark:text-background"
        fill="currentColor"
      />
    </svg>
  );
}
