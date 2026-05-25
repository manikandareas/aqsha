import type { ReactNode } from "react";
import { BrandLogoIcon } from "@/components/brand-logo-icon";
import { cn } from "@/lib/utils";

export function ComposerHeroState({
  title = "What story are we telling?",
  logoClassName = "size-8 text-mint",
  titleClassName = "font-heading text-2xl font-bold tracking-tight text-foreground sm:text-3xl leading-none",
  headerClassName,
  children,
  hint,
}: {
  title?: string;
  logoClassName?: string;
  titleClassName?: string;
  headerClassName?: string;
  children: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <div className="flex w-full max-w-2xl flex-col items-center gap-4 text-center">
      <header
        className={cn(
          "mb-4 flex flex-col items-center justify-center gap-2 text-center",
          headerClassName,
        )}
      >
        <div className="flex items-center justify-center gap-2.5">
          <BrandLogoIcon className={logoClassName} />
          <h1 className={titleClassName}>{title}</h1>
        </div>
      </header>
      <div className="w-full">{children}</div>
      {hint ? (
        <p className="max-w-sm text-[11px] leading-5 text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
