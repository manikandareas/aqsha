"use client";

import { CheckIcon, CopyIcon } from "@aqsha/ui/icons";
import { useState } from "react";

export function CopyCitationButton({
  value,
  children,
}: {
  value: string;
  children: string;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1_200);
        });
      }}
      className="flex h-8 w-full items-center justify-between rounded-md border border-border bg-background px-3 text-[13px] font-medium text-foreground transition-colors hover:bg-muted active:scale-[0.99]"
    >
      <span>{children}</span>
      {copied ? (
        <CheckIcon className="size-3.5 text-mint-foreground" />
      ) : (
        <CopyIcon className="size-3.5" />
      )}
    </button>
  );
}
