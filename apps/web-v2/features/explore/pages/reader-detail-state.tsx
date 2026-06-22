"use client";

import { ArrowLeftIcon, BookOpenIcon } from "@aqsha/ui/icons";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export function ReaderDetailState({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <div>
      <Button
        asChild
        variant="ghost"
        size="sm"
        className="-ml-2 mb-5 text-muted-foreground"
      >
        <Link href="/app/explore">
          <ArrowLeftIcon className="size-4" /> Jelajahi
        </Link>
      </Button>
      <div className="grid min-h-[48svh] place-items-center rounded-[8px] border border-border/80 bg-card/30 p-6 text-center">
        <div>
          <BookOpenIcon className="mx-auto size-8 text-muted-foreground" />
          <h1 className="mt-4 text-xl font-semibold text-foreground">{title}</h1>
          <p className="mt-2 max-w-md text-[14px] font-medium leading-6 text-muted-foreground">
            {message}
          </p>
        </div>
      </div>
    </div>
  );
}
