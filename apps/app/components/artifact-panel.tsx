"use client";

import {
  CheckIcon,
  CopyIcon,
  ExternalLinkIcon,
  FileTextIcon,
  MoreHorizontalIcon,
  PanelLeftIcon,
} from "lucide-react";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  useSidebar,
} from "@/components/ui/sidebar";

type ResearchArtifact = {
  _id: string;
  type:
    | "research_report"
    | "markdown_report"
    | "research_document"
    | "document"
    | "code"
    | "html"
    | "json"
    | "plain_text";
  title: string;
  version?: {
    _id: string;
    versionNumber: number;
    contentFormat: "markdown" | "html" | "plain" | "code" | "json";
    title: string;
    body?: string;
    changeSummary?: string;
    createdAt: number;
  } | null;
  createdAt: number;
};

export function ArtifactPanel({
  threadTitle,
  artifacts = [],
  activeArtifact,
  onOpenArtifact,
  onClosePanel,
}: {
  threadTitle?: string;
  artifacts?: ResearchArtifact[];
  activeArtifact?: ResearchArtifact | null;
  onOpenArtifact?: (artifactId: string) => void;
  onClosePanel: () => void;
}) {
  const [copiedSummary, setCopiedSummary] = useState(false);
  const { setOpenMobile } = useSidebar();

  const handleCopySummary = async () => {
    const artifactLines = artifacts.map((artifact) => `- ${artifact.title}`);
    const panelSummary = [
      threadTitle ?? "Research thread",
      "",
      `${artifacts.length} artefak`,
      ...artifactLines,
    ].join("\n");
    await navigator.clipboard.writeText(panelSummary);
    setCopiedSummary(true);
    window.setTimeout(() => setCopiedSummary(false), 1200);
  };

  const handleOpenPrimaryArtifact = () => {
    const artifact = artifacts[0];
    if (!artifact) return;
    onOpenArtifact?.(artifact._id);
  };

  const handleClosePanel = () => {
    onClosePanel();
    setOpenMobile(false);
  };

  return (
    <Sidebar
      side="right"
      collapsible="offcanvas"
      className="overflow-hidden bg-transparent [&_[data-slot=sidebar-container]]:border-l-0 [&_[data-slot=sidebar-inner]]:bg-transparent"
    >
      <SidebarHeader className="gap-0 p-0">
        <div className="flex h-9 items-center gap-2 px-2.5">
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <span className="flex h-7 min-w-0 items-center gap-1.5 rounded-[7px] bg-muted px-2 text-[12px] font-semibold text-foreground">
              <span className="truncate">Artefak</span>
              <span className="inline-flex min-w-4 items-center justify-center rounded-[6px] bg-[var(--sky-soft)] px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                {artifacts.length}
              </span>
            </span>
          </div>
          <div className="flex items-center gap-0.5">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="size-6 rounded-[6px] text-muted-foreground"
                  aria-label="Aksi panel artefak"
                >
                  <MoreHorizontalIcon className="size-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel>Panel artefak</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={handleCopySummary}>
                  <CopyIcon className="size-3.5" />
                  {copiedSummary ? "Ringkasan disalin" : "Salin ringkasan"}
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={artifacts.length === 0}
                  onSelect={handleOpenPrimaryArtifact}
                >
                  <FileTextIcon className="size-3.5" />
                  Buka artefak utama
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="size-6 rounded-[6px] text-muted-foreground"
              onClick={handleClosePanel}
              aria-label="Tutup panel artefak"
            >
              <PanelLeftIcon className="size-3.5 rotate-180" />
            </Button>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="min-h-0 overflow-x-hidden">
        <ScrollArea className="h-full">
          <div className="grid min-w-0 gap-3 px-3 pb-4 pt-1">
            {artifacts.length === 0 ? (
              <EmptyBlock
                title="Belum ada artefak"
                body="Laporan dan dokumen kerja akan tersimpan di sini."
              />
            ) : activeArtifact ? (
              <ArtifactReader artifact={activeArtifact} />
            ) : (
              <EmptyBlock
                title="Pilih artefak"
                body="Klik kartu artefak pada respons untuk membaca isinya di sini."
              />
            )}
          </div>
        </ScrollArea>
      </SidebarContent>
    </Sidebar>
  );
}

function EmptyBlock({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-[12px] border border-border/70 bg-card p-4 text-center shadow-sm">
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{body}</p>
    </div>
  );
}

function ArtifactReader({ artifact }: { artifact: ResearchArtifact }) {
  const [copied, setCopied] = useState(false);
  const version = artifact.version;
  const body = version?.body ?? "Artefak ini disimpan di storage.";
  const format = version?.contentFormat ?? "markdown";

  const copyBody = async () => {
    await navigator.clipboard.writeText(body);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  const copyLink = async () => {
    await navigator.clipboard.writeText(
      `${window.location.origin}${window.location.pathname}?artifact=${artifact._id}`,
    );
  };

  return (
    <article className="-mx-3 -mt-1 min-w-0 px-5 pb-8 pt-5 sm:px-7">
      <div className="mx-auto flex w-full max-w-[760px] items-start justify-between gap-4">
        <div className="min-w-0 pt-1">
          <h2 className="font-heading text-[26px] font-bold leading-tight tracking-normal text-foreground">
            {artifact.title}
          </h2>
          <p className="mt-2 text-[12px] font-medium text-muted-foreground">
            v{version?.versionNumber ?? 1} · {format}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="size-8 rounded-[7px] text-muted-foreground hover:bg-muted"
            onClick={copyBody}
            aria-label={copied ? "Tersalin" : "Salin artefak"}
          >
            {copied ? (
              <CheckIcon className="size-3.5" />
            ) : (
              <CopyIcon className="size-3.5" />
            )}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="size-8 rounded-[7px] text-muted-foreground hover:bg-muted"
            onClick={copyLink}
            aria-label="Bagikan link"
          >
            <ExternalLinkIcon className="size-3.5" />
          </Button>
        </div>
      </div>
      <div className="mx-auto mt-8 w-full max-w-[760px] text-[16px] leading-7 text-foreground">
        {format === "html" ? (
          <iframe
            title={artifact.title}
            sandbox=""
            srcDoc={body}
            className="h-[70svh] w-full border-0 bg-white"
          />
        ) : format === "code" || format === "plain" || format === "json" ? (
          <pre className="overflow-auto border-y bg-transparent py-4 font-mono text-[13px] leading-6 text-foreground">
            <code>{body}</code>
          </pre>
        ) : (
          <ArtifactMarkdown body={body} />
        )}
      </div>
    </article>
  );
}

function ArtifactMarkdown({ body }: { body: string }) {
  return (
    <div className="aqsha-prose">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {body}
      </ReactMarkdown>
    </div>
  );
}
