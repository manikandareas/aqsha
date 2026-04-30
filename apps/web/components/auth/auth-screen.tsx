import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type AuthScreenProps = {
  mode: "signin" | "signup";
  title: string;
  description: string;
  children: ReactNode;
  submit: ReactNode;
  switchPrompt: string;
  switchHref: string;
  switchLabel: string;
  termsCopy?: ReactNode;
};

export function AuthScreen({
  title,
  description,
  children,
  submit,
  switchPrompt,
  switchHref,
  switchLabel,
  termsCopy,
}: AuthScreenProps) {
  return (
    <div className="grid h-screen overflow-hidden bg-background text-foreground lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
      <section className="flex h-screen items-center justify-center overflow-hidden px-6 py-8 sm:px-8 lg:px-12">
        <div className="w-full max-w-[360px]">
          <AqshaMark />

          <div className="mt-8 space-y-2.5">
            <h1 className="text-[1.75rem] font-semibold leading-[1.08] tracking-[-0.035em] text-foreground sm:text-[2rem]">
              {title}
            </h1>
            <p className="max-w-[19rem] text-[0.8125rem] font-normal leading-5 text-muted-foreground">
              {description}
            </p>
          </div>

          <div className="mt-6 grid grid-cols-2 items-center gap-2.5">
            <ProviderButton
              icon={<GithubIcon />}
              label="Continue with GitHub"
            />
            <ProviderButton
              icon={<GoogleIcon />}
              label="Continue with Google"
            />
          </div>

          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-badge font-semibold tracking-badge text-muted-foreground">
              OR
            </span>
            <div className="h-px flex-1 bg-border" />
          </div>

          {children}

          {submit}

          {termsCopy ? (
            <p className="mt-4 text-center text-xs leading-5 text-muted-foreground">
              {termsCopy}
            </p>
          ) : null}

          <p className="mt-5 text-center text-[0.8125rem] text-muted-foreground">
            {switchPrompt}{" "}
            <Link
              className="font-semibold text-foreground underline underline-offset-4 transition-colors hover:text-notion-blue"
              href={switchHref}
            >
              {switchLabel}
            </Link>
          </p>
        </div>
      </section>

      <section
        className="hidden h-screen items-center justify-end overflow-hidden py-16 pl-12 lg:flex"
        aria-hidden="true"
      >
        <Image
          src="/assets/nested-screens.png"
          alt=""
          width={920}
          height={720}
          priority
          className="mr-[-7%] w-[min(96%,920px)] object-contain"
        />
      </section>
    </div>
  );
}

export function AuthField({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("space-y-2", className)}>{children}</div>;
}

function AqshaMark() {
  return (
    <div className="flex items-center gap-2" aria-label="Aqsha">
      <div className="relative size-7">
        <span className="absolute left-0 top-0 size-3.5 rounded-sm bg-notion-warm-dark" />
        <span className="absolute right-0 top-1 size-3.5 rounded-sm bg-notion-orange" />
        <span className="absolute bottom-0 left-2 size-3.5 rounded-sm bg-notion-gray-300" />
      </div>
      <span className="text-nav font-bold tracking-tight text-foreground">
        Aqsha
      </span>
    </div>
  );
}

function ProviderButton({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <Button
      type="button"
      variant="outline"
      className="h-10 w-full justify-center gap-2 rounded-md border-border bg-background px-2 text-[0.8125rem] font-medium text-foreground shadow-none hover:bg-muted"
      disabled
    >
      {icon}
      {label}
    </Button>
  );
}

function GithubIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-4"
      aria-hidden="true"
      fill="currentColor"
    >
      <path d="M12 2C6.48 2 2 6.58 2 12.25c0 4.53 2.87 8.37 6.84 9.73.5.1.68-.22.68-.5 0-.24-.01-1.04-.01-1.88-2.78.62-3.37-1.21-3.37-1.21-.45-1.18-1.11-1.5-1.11-1.5-.91-.64.07-.63.07-.63 1 .08 1.53 1.06 1.53 1.06.9 1.57 2.35 1.12 2.92.86.09-.67.35-1.12.63-1.38-2.22-.26-4.56-1.14-4.56-5.07 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.71 0 0 .84-.28 2.75 1.05A9.35 9.35 0 0 1 12 6.98c.85 0 1.7.12 2.5.35 1.91-1.33 2.75-1.05 2.75-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.94-2.34 4.8-4.57 5.06.36.32.68.94.68 1.9 0 1.38-.01 2.49-.01 2.83 0 .28.18.6.69.5A10.14 10.14 0 0 0 22 12.25C22 6.58 17.52 2 12 2Z" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M21.6 12.23c0-.76-.07-1.49-.19-2.19H12v4.14h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.89-1.74 2.98-4.31 2.98-7.48Z"
      />
      <path
        fill="#34A853"
        d="M12 22c2.7 0 4.97-.9 6.62-2.29l-3.24-2.51c-.9.6-2.05.96-3.38.96-2.6 0-4.81-1.76-5.6-4.13H3.05v2.59A10 10 0 0 0 12 22Z"
      />
      <path
        fill="#FBBC05"
        d="M6.4 14.03a6 6 0 0 1 0-3.82V7.62H3.05a10 10 0 0 0 0 8.99l3.35-2.58Z"
      />
      <path
        fill="#EA4335"
        d="M12 6.08c1.47 0 2.79.51 3.83 1.5l2.87-2.88A9.63 9.63 0 0 0 12 2a10 10 0 0 0-8.95 5.62l3.35 2.59c.79-2.37 3-4.13 5.6-4.13Z"
      />
    </svg>
  );
}
