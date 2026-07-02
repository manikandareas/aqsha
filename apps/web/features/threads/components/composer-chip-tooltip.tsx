"use client";

import { getPromptCommand } from "@aqsha/chat-core";
import { createPortal } from "react-dom";
import { splitTokenLabel } from "../lib/token-pill";

/**
 * Tooltip hover untuk chip di dalam composer. Chip adalah DOM murni (dibuat
 * `composer-inline-editor.ts`, bukan React) sehingga Radix Tooltip per-chip tak
 * bisa dipakai — `TokenizedPromptInput` mendelegasikan hover (mouseover pada
 * container) dan merender SATU tooltip terposisi dari rect chip via portal.
 * Visualnya meniru `TooltipContent` (`components/ui/tooltip.tsx`). Isi dibaca
 * dari `dataset` chip: command → nama + deskripsi command; mention → label
 * PENUH (tampilan chip ter-truncate CSS) + jenis konteksnya.
 */

const CONTEXT_KIND_LABELS: Record<string, string> = {
  workspace: "Workspace",
  paper: "Paper",
  "explore-paper": "Paper Explore",
  news: "Berita",
  "artifact-selection": "Pilihan blok editor",
};

type ChipTooltipContent = { title: string; description?: string };

function buildChipTooltipContent(chip: HTMLElement): ChipTooltipContent | null {
  if (chip.dataset.chip === "command") {
    const command = getPromptCommand(chip.dataset.commandId);
    if (!command) return null;
    return { title: `${command.slug} · ${command.label}`, description: command.description };
  }
  const kind = chip.dataset.kind ?? "";
  const label = chip.dataset.label ?? chip.textContent ?? "";
  const { text } = splitTokenLabel(label);
  // Label paper = "workspace:judul" — pecah supaya judul penuh jadi baris utama.
  if (kind === "paper") {
    const separator = text.indexOf(":");
    if (separator > 0) {
      return {
        title: text.slice(separator + 1).trim(),
        description: `Paper · ${text.slice(0, separator).trim()}`,
      };
    }
  }
  const title = text.trim();
  if (!title) return null;
  return { title, description: CONTEXT_KIND_LABELS[kind] };
}

export function ComposerChipTooltip({ chip }: { chip: HTMLElement }) {
  // Chip bisa sudah dicabut dari editor (backspace/klik) sebelum state hover ikut bersih.
  if (!chip.isConnected) return null;
  const content = buildChipTooltipContent(chip);
  if (!content) return null;
  const rect = chip.getBoundingClientRect();
  return createPortal(
    <div
      className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-full"
      style={{ top: rect.top - 6, left: rect.left + rect.width / 2 }}
      role="tooltip"
    >
      <div className="relative max-w-xs rounded-md bg-foreground px-3 py-1.5 text-xs text-background">
        <p className="break-words font-medium">{content.title}</p>
        {content.description ? (
          <p className="mt-0.5 break-words text-background/70">{content.description}</p>
        ) : null}
        <p className="mt-1 text-[10.5px] text-background/55">Klik untuk menghapus</p>
        <div className="absolute -bottom-1 left-1/2 size-2 -translate-x-1/2 rotate-45 rounded-[2px] bg-foreground" />
      </div>
    </div>,
    document.body,
  );
}
