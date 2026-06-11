import { ExternalLinkIcon } from "@aqsha/ui/icons";
import type { ReactNode } from "react";

export function PropertyRow({
  label,
  value,
  badge,
  mutedValue,
  icon,
}: {
  label: string;
  value: string;
  badge?: boolean;
  mutedValue?: string;
  icon?: ReactNode;
}) {
  return (
    <div>
      <dt className="text-[12px] font-medium text-muted-foreground">{label}</dt>
      <dd
        className="mt-1.5 flex min-w-0 items-center gap-1.5 text-[13px] font-medium text-foreground"
        title={value}
      >
        {icon}
        {badge ? (
          <span className="min-w-0 truncate rounded-md bg-muted px-2 py-0.5 text-[13px] font-semibold">
            {value}
          </span>
        ) : (
          <span className="min-w-0 truncate">{value}</span>
        )}
        {mutedValue ? (
          <span className="min-w-0 truncate text-xs font-semibold uppercase text-muted-foreground">
            {mutedValue}
          </span>
        ) : null}
      </dd>
    </div>
  );
}

export function PropertyLink({
  label,
  value,
  href,
}: {
  label: string;
  value: string;
  href: string;
}) {
  return (
    <div>
      <dt className="text-[12px] font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1.5 min-w-0">
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="inline-flex max-w-full items-center gap-1 text-[13px] font-medium text-sky-foreground hover:underline"
          title={value}
        >
          <span className="truncate">{value}</span>
          <ExternalLinkIcon className="size-3.5 shrink-0" />
        </a>
      </dd>
    </div>
  );
}
