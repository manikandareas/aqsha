"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

type ErrorStateAction = {
  label: string;
} & (
  | {
      href: string;
      onClick?: never;
      behavior?: never;
    }
  | {
      href?: never;
      onClick: () => void;
      behavior?: never;
    }
  | {
      href?: never;
      onClick?: never;
      behavior: "back";
    }
);

type ErrorStatePageProps = {
  eyebrow: string;
  title: string;
  description: string;
  imageSrc: string;
  imageAlt: string;
  primaryAction: ErrorStateAction;
  secondaryAction: ErrorStateAction;
  referenceCode?: string;
};

function ErrorStateActionButton({
  action,
  variant = "default",
}: {
  action: ErrorStateAction;
  variant?: React.ComponentProps<typeof Button>["variant"];
}) {
  const className = "aqsha-error-state-action h-10 px-4 active:scale-[0.98]";
  const router = useRouter();

  if (action.href) {
    return (
      <Button asChild className={className} variant={variant}>
        <Link href={action.href}>{action.label}</Link>
      </Button>
    );
  }

  if (action.behavior === "back") {
    return (
      <Button
        className={className}
        onClick={() => {
          if (window.history.length > 1) {
            router.back();
            return;
          }

          router.push("/app");
        }}
        type="button"
        variant={variant}
      >
        {action.label}
      </Button>
    );
  }

  return (
    <Button className={className} onClick={action.onClick} type="button" variant={variant}>
      {action.label}
    </Button>
  );
}

export function ErrorStatePage({
  eyebrow,
  title,
  description,
  imageSrc,
  imageAlt,
  primaryAction,
  secondaryAction,
  referenceCode,
}: ErrorStatePageProps) {
  return (
    <main className="aqsha-error-state-page h-svh overflow-hidden bg-background px-5 py-6 text-foreground sm:px-8 sm:py-8 lg:px-12 lg:py-10">
      <section className="mx-auto grid h-full min-h-0 w-full max-w-6xl grid-rows-[minmax(0,0.9fr)_auto] items-center gap-5 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1fr)] lg:grid-rows-1 lg:gap-16">
        <div className="order-1 mx-auto flex min-h-0 w-full max-w-[min(58vw,230px)] items-center justify-center sm:max-w-[280px] lg:order-2 lg:max-w-[min(42vw,520px)]">
          <Image
            alt={imageAlt}
            className="h-auto max-h-[36svh] w-full select-none object-contain lg:max-h-[calc(100svh-5rem)]"
            height={1254}
            priority
            sizes="(min-width: 1024px) 520px, (min-width: 640px) 420px, calc(100vw - 48px)"
            src={imageSrc}
            width={1254}
          />
        </div>

        <div className="order-2 flex min-h-0 max-w-2xl flex-col items-start gap-5 self-start lg:order-1 lg:self-center">
          <div className="space-y-3">
            <p className="text-sm font-medium text-muted-foreground">{eyebrow}</p>
            <h1 className="max-w-xl text-3xl font-semibold leading-tight tracking-normal text-balance sm:text-4xl lg:text-5xl">
              {title}
            </h1>
            <p className="max-w-xl text-sm leading-6 text-muted-foreground sm:text-base sm:leading-7 lg:text-lg">
              {description}
            </p>
          </div>

          {referenceCode ? (
            <p className="rounded-md border border-border bg-muted/35 px-3 py-2 font-mono text-xs text-muted-foreground">
              Kode bantuan: {referenceCode}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <ErrorStateActionButton action={primaryAction} />
            <ErrorStateActionButton action={secondaryAction} variant="outline" />
          </div>
        </div>
      </section>
    </main>
  );
}
