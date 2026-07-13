"use client";

import { FolderIcon } from "@aqsha/ui/icons";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useIntegrations } from "@/features/settings/api";
import {
  type IntegrationProviderKey,
  PROVIDER_META,
} from "@/features/settings/lib/integrations";
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
import { useProviderFolders, useProviderSyncCommit, useProviderSyncPreview } from "../api";
import type { ImportCommitResult, ImportDuplicatePolicy, ImportPreviewResult } from "../types";
import { PreviewStep } from "./citation-import-wizard";

type WizardStep =
  | { step: "folder" }
  | { step: "preview"; preview: ImportPreviewResult }
  | { step: "done"; result: ImportCommitResult };

/**
 * Wizard "Tarik dari Mendeley/Zotero" (Fase 5): pilih folder → preview → commit.
 * Reuse `PreviewStep` (checkbox + policy + commit) dari wizard import file — satu
 * pipeline preview→commit. Koneksi provider dikelola di Settings → Integrasi.
 */
export function ProviderSyncWizard({
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
        <SyncWizardContent
          workspaceId={workspaceId}
          onOpenChange={onOpenChange}
          onDone={onDone}
        />
      ) : null}
    </Dialog>
  );
}

function SyncWizardContent({
  workspaceId,
  onOpenChange,
  onDone,
}: {
  workspaceId: string;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const integrations = useIntegrations();
  const connected = useMemo(
    () => (integrations.data ?? []).filter((i) => i.available && i.status === "connected"),
    [integrations.data],
  );
  const [provider, setProvider] = useState<IntegrationProviderKey | null>(null);
  const activeProvider = provider ?? connected[0]?.provider ?? null;

  if (integrations.isLoading) {
    return (
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Tarik dari provider</DialogTitle>
        </DialogHeader>
        <p className="py-6 text-center text-[13px] font-medium text-muted-foreground">
          Memuat koneksi…
        </p>
      </DialogContent>
    );
  }

  if (!activeProvider) {
    return (
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Belum ada akun terhubung</DialogTitle>
          <DialogDescription>
            Hubungkan akun Mendeley atau Zotero terlebih dahulu untuk menarik referensi.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Tutup
          </Button>
          <Button asChild>
            <Link href="/app/settings/integrations">Buka Pengaturan → Integrasi</Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    );
  }

  return (
    <SyncFlow
      workspaceId={workspaceId}
      provider={activeProvider}
      providers={connected.map((c) => c.provider)}
      onProviderChange={setProvider}
      onOpenChange={onOpenChange}
      onDone={onDone}
    />
  );
}

function SyncFlow({
  workspaceId,
  provider,
  providers,
  onProviderChange,
  onOpenChange,
  onDone,
}: {
  workspaceId: string;
  provider: IntegrationProviderKey;
  providers: IntegrationProviderKey[];
  onProviderChange: (provider: IntegrationProviderKey) => void;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const [state, setState] = useState<WizardStep>({ step: "folder" });
  const [error, setError] = useState<string | null>(null);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [policy, setPolicy] = useState<ImportDuplicatePolicy>("merge");

  const folders = useProviderFolders(provider, state.step === "folder");
  const preview = useProviderSyncPreview(workspaceId, provider);
  const commit = useProviderSyncCommit(workspaceId, provider);

  const handlePreview = async () => {
    setError(null);
    try {
      const result = await preview.mutateAsync({ folderId });
      setSelected(new Set(result.records.map((r) => r.index)));
      setState({ step: "preview", preview: result });
    } catch (err) {
      setError(readableApiErrorMessage(err, "Gagal menarik referensi"));
    }
  };

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
      setError(readableApiErrorMessage(err, "Commit sinkron gagal"));
    }
  };

  if (state.step === "preview") {
    return (
      <DialogContent className="sm:max-w-2xl">
        <PreviewStep
          preview={state.preview}
          title="Preview sinkron"
          backLabel="Ganti folder"
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
          onBack={() => setState({ step: "folder" })}
          onCommit={handleCommit}
        />
      </DialogContent>
    );
  }

  if (state.step === "done") {
    return (
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Sinkron selesai</DialogTitle>
          <DialogDescription>
            {state.result.created} dibuat · {state.result.merged} diperbarui ·{" "}
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
      </DialogContent>
    );
  }

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Tarik dari {PROVIDER_META[provider].label}</DialogTitle>
        <DialogDescription>
          Pilih folder untuk melihat pratinjau referensi sebelum menambahkannya.
        </DialogDescription>
      </DialogHeader>

      {providers.length > 1 ? (
        <label className="grid gap-1.5">
          <span className="text-[12px] font-semibold text-foreground">Akun</span>
          <select
            value={provider}
            onChange={(event) => onProviderChange(event.target.value as IntegrationProviderKey)}
            className="h-9 rounded-lg border border-border bg-background px-3 text-[13px]"
          >
            {providers.map((p) => (
              <option key={p} value={p}>
                {PROVIDER_META[p].label}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <div className="grid gap-1.5">
        <span className="text-[12px] font-semibold text-foreground">Folder</span>
        <div className="max-h-[40vh] overflow-y-auto rounded-lg border border-border/70">
          <FolderOption
            label="Semua referensi"
            active={folderId === null}
            onSelect={() => setFolderId(null)}
          />
          {folders.isLoading ? (
            <p className="px-3 py-2 text-[12px] font-medium text-muted-foreground">Memuat folder…</p>
          ) : (
            (folders.data ?? []).map((folder) => (
              <FolderOption
                key={folder.id}
                label={folder.name}
                active={folderId === folder.id}
                onSelect={() => setFolderId(folder.id)}
              />
            ))
          )}
        </div>
      </div>

      {error ? <p className="text-[12px] font-medium text-destructive">{error}</p> : null}
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
          Batal
        </Button>
        <Button type="button" onClick={handlePreview} disabled={preview.isPending}>
          {preview.isPending ? "Menarik…" : "Pratinjau"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function FolderOption({
  label,
  active,
  onSelect,
}: {
  label: string;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-2 border-b border-border/50 px-3 py-2 text-left text-[13px] font-medium last:border-b-0 hover:bg-muted/40",
        active ? "bg-muted/60 text-foreground" : "text-muted-foreground",
      )}
    >
      <FolderIcon className="size-3.5 shrink-0" />
      <span className="truncate">{label}</span>
    </button>
  );
}
