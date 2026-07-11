"use client";

import { CheckIcon, UploadIcon } from "@aqsha/ui/icons";
import { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { readableApiErrorMessage } from "@/lib/api-error";
import { cn } from "@/lib/utils";
import { useImportCommit, useImportPreview } from "../api";
import {
  CITATION_STATUS_LABELS,
  citationMetaLine,
  type ImportCommitResult,
  type ImportDuplicatePolicy,
  type ImportPreviewResult,
} from "../types";

const MAX_FILE_BYTES = 10 * 1024 * 1024;

type WizardStep =
  | { step: "upload" }
  | { step: "preview"; preview: ImportPreviewResult }
  | { step: "done"; result: ImportCommitResult };

/**
 * Wizard import `.bib`/`.ris` (upload → preview → commit + summary) — Dialog
 * multi-step di luar panel karena butuh lebar/fokus. Preview tidak menulis library;
 * commit mengikuti checkbox + policy duplikat.
 */
export function CitationImportWizard({
  workspaceId,
  open,
  onOpenChange,
  onDone,
}: {
  workspaceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? (
        <ImportWizardContent
          workspaceId={workspaceId}
          onOpenChange={onOpenChange}
          onDone={onDone}
        />
      ) : null}
    </Dialog>
  );
}

function ImportWizardContent({
  workspaceId,
  onOpenChange,
  onDone,
}: {
  workspaceId: string;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const [state, setState] = useState<WizardStep>({ step: "upload" });
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [policy, setPolicy] = useState<ImportDuplicatePolicy>("skip");
  const [dragOver, setDragOver] = useState(false);
  const preview = useImportPreview(workspaceId);
  const commit = useImportCommit(workspaceId);

  const handleFile = useCallback(
    async (file: File | null | undefined) => {
      if (!file) return;
      setError(null);
      if (file.size > MAX_FILE_BYTES) {
        setError("File melebihi batas 10 MB.");
        return;
      }
      try {
        const result = await preview.mutateAsync(file);
        // Default tercentang: valid + incomplete; duplikat mengikuti policy saat commit.
        setSelected(new Set(result.records.map((r) => r.index)));
        setState({ step: "preview", preview: result });
      } catch (err) {
        setError(readableApiErrorMessage(err, "File tidak bisa diproses"));
      }
    },
    [preview],
  );

  const handleCommit = async () => {
    if (state.step !== "preview") return;
    setError(null);
    try {
      const result = await commit.mutateAsync({
        batchId: state.preview.batchId,
        selectedIndexes: [...selected],
        duplicatePolicy: policy,
      });
      setState({ step: "done", result });
    } catch (err) {
      setError(readableApiErrorMessage(err, "Commit import gagal"));
    }
  };

  return (
    <DialogContent className="sm:max-w-2xl">
      {state.step === "upload" ? (
        <>
          <DialogHeader>
            <DialogTitle>Import referensi</DialogTitle>
            <DialogDescription>
              Ekspor koleksi dari Mendeley atau Zotero sebagai BibTeX (.bib) atau RIS (.ris),
              lalu unggah di sini. Maks 10 MB per file.
            </DialogDescription>
          </DialogHeader>
          <label
            className={cn(
              "grid cursor-pointer place-items-center gap-2 rounded-xl border border-dashed border-border px-6 py-12 text-center transition-colors",
              dragOver ? "border-primary bg-primary/5" : "hover:bg-muted/40",
            )}
            onDragOver={(event) => {
              event.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragOver(false);
              void handleFile(event.dataTransfer.files?.[0]);
            }}
          >
            <UploadIcon className="size-5 text-muted-foreground" />
            <span className="text-[13px] font-semibold text-foreground">
              {preview.isPending ? "Memproses file…" : "Letakkan file .bib/.ris atau klik untuk memilih"}
            </span>
            <input
              type="file"
              accept=".bib,.ris,.txt"
              className="hidden"
              disabled={preview.isPending}
              onChange={(event) => void handleFile(event.target.files?.[0])}
            />
          </label>
          {error ? <p className="text-[12px] font-medium text-destructive">{error}</p> : null}
        </>
      ) : state.step === "preview" ? (
        <PreviewStep
          preview={state.preview}
          selected={selected}
          onToggle={(index) =>
            setSelected((prev) => {
              const next = new Set(prev);
              if (next.has(index)) next.delete(index);
              else next.add(index);
              return next;
            })
          }
          policy={policy}
          onPolicyChange={setPolicy}
          error={error}
          pending={commit.isPending}
          onBack={() => setState({ step: "upload" })}
          onCommit={handleCommit}
        />
      ) : (
        <>
          <DialogHeader>
            <DialogTitle>Import selesai</DialogTitle>
            <DialogDescription>
              {state.result.created} dibuat · {state.result.merged} digabung ·{" "}
              {state.result.skipped} dilewati.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              onClick={() => {
                onOpenChange(false);
                onDone();
              }}
            >
              Lihat di Sitasi
            </Button>
          </DialogFooter>
        </>
      )}
    </DialogContent>
  );
}

/**
 * Langkah preview (checkbox + policy duplikat + commit). Dipakai wizard import file
 * DAN wizard sinkron provider (Fase 5) — didorong murni oleh `ImportPreviewResult`.
 */
export function PreviewStep({
  preview,
  selected,
  onToggle,
  policy,
  onPolicyChange,
  error,
  pending,
  onBack,
  onCommit,
  title,
  backLabel = "Ganti file",
}: {
  preview: ImportPreviewResult;
  selected: Set<number>;
  onToggle: (index: number) => void;
  policy: ImportDuplicatePolicy;
  onPolicyChange: (policy: ImportDuplicatePolicy) => void;
  error: string | null;
  pending: boolean;
  onBack: () => void;
  onCommit: () => void;
  /** Judul dialog kustom (default: "Preview import (.bib/.ris)"). */
  title?: string;
  backLabel?: string;
}) {
  const formatLabel =
    preview.format === "bibtex" ? ".bib" : preview.format === "ris" ? ".ris" : null;
  const chips = useMemo(
    () =>
      [
        { label: `${preview.counts.valid} valid`, tone: "text-foreground" },
        { label: `${preview.counts.incomplete} belum lengkap`, tone: "text-amber-600" },
        { label: `${preview.counts.duplicate} duplikat`, tone: "text-lavender-foreground" },
        { label: `${preview.counts.error} error`, tone: "text-destructive" },
      ] as const,
    [preview.counts],
  );

  return (
    <>
      <DialogHeader>
        <DialogTitle>{title ?? `Preview import${formatLabel ? ` (${formatLabel})` : ""}`}</DialogTitle>
        <DialogDescription className="flex flex-wrap gap-2">
          {chips.map((chip) => (
            <span
              key={chip.label}
              className={cn(
                "rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold",
                chip.tone,
              )}
            >
              {chip.label}
            </span>
          ))}
        </DialogDescription>
      </DialogHeader>

      <div className="max-h-[45vh] overflow-y-auto rounded-lg border border-border/70">
        {preview.records.map((record) => {
          const checked = selected.has(record.index);
          const duplicate = record.duplicateOfId || record.duplicateInBatch;
          return (
            <button
              key={record.index}
              type="button"
              onClick={() => onToggle(record.index)}
              className={cn(
                "flex w-full items-start gap-2.5 border-b border-border/50 px-3 py-2 text-left last:border-b-0 hover:bg-muted/40",
                !checked && "opacity-55",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "mt-0.5 grid size-4 shrink-0 place-items-center rounded border",
                  checked
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background",
                )}
              >
                {checked ? <CheckIcon className="size-3" /> : null}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold text-foreground">
                  {record.title}
                </span>
                <span className="block truncate text-[12px] font-medium text-muted-foreground">
                  {citationMetaLine(record)}
                </span>
                <span className="mt-0.5 flex flex-wrap gap-1.5 text-[11px] font-medium">
                  {duplicate ? (
                    <span className="rounded-full bg-lavender-soft px-1.5 py-0.5 text-lavender-foreground">
                      duplikat{record.duplicateOfTitle ? `: ${record.duplicateOfTitle}` : ""}
                    </span>
                  ) : null}
                  {record.metadataStatus !== "verified" ? (
                    <span className="rounded-full bg-muted px-1.5 py-0.5 text-muted-foreground">
                      {CITATION_STATUS_LABELS[record.metadataStatus]}
                    </span>
                  ) : null}
                  {record.issues.map((issue) => (
                    <span key={issue} className="text-muted-foreground/80">
                      {issue}
                    </span>
                  ))}
                </span>
              </span>
            </button>
          );
        })}
        {preview.errors.length > 0 ? (
          <details className="border-t border-border/70 px-3 py-2">
            <summary className="cursor-pointer text-[12px] font-semibold text-destructive">
              {preview.errors.length} entry gagal diparse
            </summary>
            <ul className="mt-1 grid gap-1 text-[11px] font-medium text-muted-foreground">
              {preview.errors.map((err) => (
                <li key={`${err.index}-${err.message}`} className="truncate">
                  #{err.index + 1}: {err.message}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>

      <fieldset className="flex flex-wrap items-center gap-3">
        <legend className="sr-only">Kebijakan duplikat</legend>
        <span className="text-[12px] font-semibold text-foreground">Duplikat:</span>
        {(
          [
            { id: "skip", label: "lewati" },
            { id: "merge", label: "lengkapi field kosong" },
            { id: "import", label: "import tetap" },
          ] as const
        ).map((option) => (
          <label
            key={option.id}
            className="flex cursor-pointer items-center gap-1.5 text-[12px] font-medium text-muted-foreground"
          >
            <input
              type="radio"
              name="duplicate-policy"
              checked={policy === option.id}
              onChange={() => onPolicyChange(option.id)}
            />
            {option.label}
          </label>
        ))}
      </fieldset>

      {error ? <p className="text-[12px] font-medium text-destructive">{error}</p> : null}
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onBack} disabled={pending}>
          {backLabel}
        </Button>
        <Button type="button" onClick={onCommit} disabled={pending || selected.size === 0}>
          {pending ? "Mengimpor…" : `Import ${selected.size} referensi`}
        </Button>
      </DialogFooter>
    </>
  );
}
