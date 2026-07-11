"use client";

import { FileTextIcon, LinkIcon, PenLineIcon, Quote, UploadIcon } from "@aqsha/ui/icons";
import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * Empty state tab Sitasi — anatomi `WorkspaceLibraryEmpty` (badge pill → title +
 * deskripsi → hairline connector → stacked pill actions). Footnote koneksi provider
 * kini tautan ke Settings → Integrasi (Fase 5 live).
 */
export function CitationEmptyState({
  onImportFile,
  onAddByDoi,
  onAddManual,
}: {
  onImportFile: () => void;
  onAddByDoi: () => void;
  onAddManual: () => void;
}) {
  return (
    <div className="flex min-h-full flex-col items-center justify-center px-6 py-12 text-center">
      <div className="inline-flex items-center gap-2.5 rounded-full border border-border/70 bg-background/70 py-2 pl-3.5 pr-5 shadow-[0_1px_2px_rgb(0_0_0/0.04)] backdrop-blur-sm">
        <span className="grid size-7 place-items-center rounded-full bg-lavender-soft text-lavender-foreground ring-1 ring-inset ring-lavender-soft-border">
          <Quote className="size-4" />
        </span>
        <span className="font-heading text-base font-semibold text-foreground">Sitasi</span>
      </div>

      <div className="mt-5 grid max-w-[17rem] gap-1.5">
        <p className="text-[15px] font-semibold text-foreground">Belum ada referensi</p>
        <p className="text-[13px] font-medium leading-relaxed text-muted-foreground">
          Kumpulkan referensi workspace ini untuk disisipkan ke dokumen dan diekspor sebagai
          daftar pustaka.
        </p>
      </div>

      <div
        aria-hidden
        className="my-6 h-14 w-px bg-gradient-to-b from-transparent via-border to-transparent"
      />
      <div className="flex flex-col items-center gap-2">
        <Button type="button" className="rounded-full px-4" onClick={onImportFile}>
          <UploadIcon className="size-4" />
          Import dari Mendeley/Zotero (.bib/.ris)
        </Button>
        <Button type="button" variant="secondary" className="rounded-full px-4" onClick={onAddByDoi}>
          <LinkIcon className="size-4" />
          Tambah dari DOI
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="rounded-full px-4"
          onClick={onAddManual}
        >
          <PenLineIcon className="size-4" />
          Tambah manual
        </Button>
      </div>

      <p className="mt-8 max-w-[19rem] text-[12px] font-medium text-muted-foreground/80">
        <FileTextIcon className="mr-1 inline size-3 align-[-1px]" />
        Hubungkan akun Mendeley atau Zotero di{" "}
        <Link
          href="/app/settings/integrations"
          className="font-semibold text-foreground underline-offset-2 hover:underline"
        >
          Pengaturan → Integrasi
        </Link>
      </p>
    </div>
  );
}
