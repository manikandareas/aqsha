"use client";

import { cn } from "@/lib/utils";
import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import { math } from "@streamdown/math";
import { mermaid } from "@streamdown/mermaid";
import type { UIMessage } from "ai";
import type {
  ButtonHTMLAttributes,
  ComponentProps,
  HTMLAttributes,
  ReactNode,
} from "react";
import { Streamdown } from "streamdown";
import dynamic from "next/dynamic";
import { CitationMarkdownComponent } from "./inline-citation";
import { TableBlock } from "./table-block";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export type MessageProps = HTMLAttributes<HTMLDivElement> & {
  from: UIMessage["role"];
};

export const Message = ({ className, from, ...props }: MessageProps) => (
  <div
    className={cn(
      "group mx-auto flex w-full min-w-0 max-w-3xl flex-col gap-2 overflow-x-hidden",
      from === "user" ? "is-user justify-end" : "is-assistant",
      className
    )}
    {...props}
  />
);

export type MessageContentProps = HTMLAttributes<HTMLDivElement>;

export const MessageContent = ({
  children,
  className,
  ...props
}: MessageContentProps) => (
  <div
    className={cn(
      "is-user:dark flex w-fit min-w-0 max-w-full flex-col gap-2 overflow-hidden text-sm",
      "group-[.is-user]:ml-auto group-[.is-user]:rounded-lg group-[.is-user]:bg-secondary group-[.is-user]:px-4 group-[.is-user]:py-3 group-[.is-user]:text-foreground",
      "group-[.is-assistant]:text-foreground",
      className
    )}
    {...props}
  >
    {children}
  </div>
);

export type MessageResponseProps = ComponentProps<typeof Streamdown>;

const streamdownPlugins = { cjk, code, math, mermaid };
// Subtree deep-viz (6 komponen blok + skema zod chat-core) di-lazy-load: element `deepviz` hanya
// muncul di laporan `/deep`, jadi pesan chat biasa tak perlu ikut memuatnya di bundle awal.
const DeepVizMarkdownComponent = dynamic(
  () =>
    import("@/features/threads/components/deep-viz/viz-block").then(
      (m) => m.DeepVizMarkdownComponent,
    ),
  {
    loading: () => (
      <div className="my-4 h-24 animate-pulse rounded-xl border border-dashed bg-muted/30" />
    ),
  },
);
// Komponen default: tabel kustom + element `citation` (pill sitasi inline) + element `deepviz`
// (blok evidence viz laporan `/deep`). `citation`/`deepviz` hanya muncul bila pemanggil meneruskan
// `reportRehypePlugins` (lihat `Response`); tanpa itu komponen tak terpakai.
const streamdownComponents = {
  table: TableBlock,
  citation: CitationMarkdownComponent,
  deepviz: DeepVizMarkdownComponent,
};

export const MessageResponse = ({ className, components, ...props }: MessageResponseProps) => (
    <Streamdown
      className={cn(
        "size-full min-w-0 max-w-full overflow-x-hidden break-words [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
        className
      )}
      plugins={streamdownPlugins}
      components={{ ...streamdownComponents, ...components }}
      controls={{ table: false }}
      {...props}
    />
  );

MessageResponse.displayName = "MessageResponse";

export type MessageToolbarProps = HTMLAttributes<HTMLDivElement>;

export const MessageToolbar = ({
  children,
  className,
  ...props
}: MessageToolbarProps) => (
  <div
    className={cn(
      "flex w-full min-w-0 items-center justify-between gap-2",
      className,
    )}
    {...props}
  >
    {children}
  </div>
);

export type MessageActionsProps = HTMLAttributes<HTMLDivElement>;

export const MessageActions = ({
  children,
  className,
  ...props
}: MessageActionsProps) => (
  <div
    className={cn(
      "flex min-w-0 items-center gap-1 text-muted-foreground",
      className,
    )}
    {...props}
  >
    {children}
  </div>
);

export type MessageActionProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "aria-label"
> & {
  label: string;
  tooltip?: ReactNode;
};

export const MessageAction = ({
  children,
  className,
  disabled,
  label,
  tooltip,
  type = "button",
  ...props
}: MessageActionProps) => {
  const button = (
    <button
      aria-label={label}
      className={cn(
        "inline-flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground",
        className,
      )}
      disabled={disabled}
      type={type}
      {...props}
    >
      {children}
    </button>
  );

  if (!tooltip) {
    return button;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {disabled ? (
          <span className="inline-flex cursor-not-allowed">{button}</span>
        ) : (
          button
        )}
      </TooltipTrigger>
      <TooltipContent side="top">{tooltip}</TooltipContent>
    </Tooltip>
  );
};

MessageToolbar.displayName = "MessageToolbar";
MessageActions.displayName = "MessageActions";
MessageAction.displayName = "MessageAction";
