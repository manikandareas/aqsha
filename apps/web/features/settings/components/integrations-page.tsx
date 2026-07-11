"use client";

import { Button } from "@aqsha/ui/components/button";
import { Input } from "@aqsha/ui/components/input";
import { RotateCcwIcon } from "@aqsha/ui/icons";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { readableApiErrorMessage } from "@/lib/api-error";
import {
  useConnectApiKeyIntegration,
  useConnectIntegration,
  useDisconnectIntegration,
  useIntegrations,
  useRefreshIntegration,
} from "../api";
import {
  INTEGRATION_ERROR_MESSAGES,
  INTEGRATION_STATUS_LABELS,
  type IntegrationProviderKey,
  type IntegrationStatusView,
  PROVIDER_AUTH_MODE,
  PROVIDER_META,
} from "../lib/integrations";
import { SettingsHeader } from "./settings-header";
import {
  SettingsPanel,
  SettingsPanelFooter,
  SettingsPanelHeader,
  SettingsPill,
  SettingsRow,
} from "./settings-card";

const KNOWN_PROVIDERS: IntegrationProviderKey[] = ["mendeley", "zotero"];

function formatSyncTime(ms: number | null): string {
  if (!ms) return "Belum pernah";
  return new Date(ms).toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Settings → Integrasi (Fase 5). Kartu per provider: status koneksi + connect
 * (OAuth redirect) / disconnect / sinkron. Lifecycle koneksi = account-level;
 * penarikan data per-workspace ada di tab Sitasi. Additive-only, no redesign.
 */
export function IntegrationsPage() {
  const integrations = useIntegrations();
  const router = useRouter();
  const params = useSearchParams();

  // Toast hasil callback OAuth lalu bersihkan query supaya tak berulang saat refresh.
  useEffect(() => {
    const connected = params.get("connected");
    const error = params.get("error");
    if (!connected && !error) return;
    if (connected) {
      const label = PROVIDER_META[connected as IntegrationProviderKey]?.label ?? connected;
      toast.success(`${label} terhubung.`);
    } else if (error) {
      toast.error(INTEGRATION_ERROR_MESSAGES[error] ?? "Koneksi gagal.");
    }
    router.replace("/app/settings/integrations");
  }, [params, router]);

  const byProvider = new Map((integrations.data ?? []).map((i) => [i.provider, i]));

  return (
    <>
      <SettingsHeader section="integrations" />
      {KNOWN_PROVIDERS.map((provider) => (
        <ProviderCard
          key={provider}
          provider={provider}
          status={byProvider.get(provider) ?? null}
          loading={integrations.isLoading}
        />
      ))}
    </>
  );
}

function statusPill(status: IntegrationStatusView | null, available: boolean): string {
  if (!available) return "Segera";
  if (!status || status.status === "disconnected") return INTEGRATION_STATUS_LABELS.disconnected;
  return INTEGRATION_STATUS_LABELS[status.status];
}

function ProviderCard({
  provider,
  status,
  loading,
}: {
  provider: IntegrationProviderKey;
  status: IntegrationStatusView | null;
  loading: boolean;
}) {
  const meta = PROVIDER_META[provider];
  const connect = useConnectIntegration();
  const disconnect = useDisconnectIntegration();
  const refresh = useRefreshIntegration();
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [keyDialogOpen, setKeyDialogOpen] = useState(false);

  const available = status?.available ?? true;
  const authMode = status?.authMode ?? PROVIDER_AUTH_MODE[provider];
  const configured = status?.configured ?? false;
  const connected = status?.status === "connected";
  const needsAttention = status?.status === "expired" || status?.status === "error";

  return (
    <SettingsPanel>
      <SettingsPanelHeader
        title={meta.label}
        description={meta.description}
        action={
          <SettingsPill
            className={
              connected
                ? "border-mint/40 bg-mint-soft text-mint-foreground"
                : needsAttention
                  ? "border-amber-300/50 bg-amber-50 text-amber-700"
                  : undefined
            }
          >
            {statusPill(status, available)}
          </SettingsPill>
        }
      />

      {connected ? (
        <div className="divide-y divide-border/60">
          <SettingsRow label="Akun">
            <span className="text-muted-foreground">
              {status?.profile?.name ?? status?.profile?.email ?? "Terhubung"}
            </span>
          </SettingsRow>
          <SettingsRow label="Cakupan" description="Aqsha hanya menarik metadata referensi, bukan file PDF.">
            <span className="text-muted-foreground">Metadata saja</span>
          </SettingsRow>
          <SettingsRow label="Sinkron terakhir">
            <span className="text-muted-foreground">{formatSyncTime(status?.lastSyncAt ?? null)}</span>
          </SettingsRow>
        </div>
      ) : needsAttention && status?.lastError ? (
        <div className="divide-y divide-border/60">
          <SettingsRow label="Status" description={status.lastError}>
            <span className="text-amber-700">Perlu dihubungkan ulang</span>
          </SettingsRow>
        </div>
      ) : null}

      <SettingsPanelFooter className="justify-end">
        {!available ? (
          <span className="text-[12px] text-muted-foreground">
            Integrasi {meta.label} segera hadir.
          </span>
        ) : !configured ? (
          <span className="text-[12px] text-muted-foreground">
            Belum dikonfigurasi di server.
          </span>
        ) : connected ? (
          <>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={refresh.isPending}
              onClick={() => refresh.mutate(provider)}
            >
              <RotateCcwIcon className="size-3.5" />
              {refresh.isPending ? "Menyinkronkan…" : "Sinkronkan sekarang"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={() => setConfirmDisconnect(true)}
            >
              Putuskan
            </Button>
          </>
        ) : (
          <Button
            type="button"
            size="sm"
            disabled={loading || connect.isPending}
            onClick={() =>
              authMode === "api_key" ? setKeyDialogOpen(true) : connect.mutate(provider)
            }
          >
            {needsAttention ? "Hubungkan ulang" : "Hubungkan"}
          </Button>
        )}
      </SettingsPanelFooter>

      {authMode === "api_key" ? (
        <ApiKeyConnectDialog
          provider={provider}
          open={keyDialogOpen}
          onOpenChange={setKeyDialogOpen}
        />
      ) : null}

      <ConfirmDialog
        open={confirmDisconnect}
        onOpenChange={setConfirmDisconnect}
        title={`Putuskan ${meta.label}?`}
        description="Koneksi diputuskan dan token dihapus. Referensi yang sudah tersimpan di Aqsha tetap aman."
        confirmLabel="Putuskan"
        onConfirm={async () => {
          await disconnect.mutateAsync(provider);
          setConfirmDisconnect(false);
        }}
      />
    </SettingsPanel>
  );
}

/**
 * Dialog connect via API key (Zotero — tanpa OAuth). User menempel API key
 * (wajib) + user ID (opsional, terdeteksi otomatis dari key). Key divalidasi di
 * server ke Zotero sebelum disimpan terenkripsi.
 */
function ApiKeyConnectDialog({
  provider,
  open,
  onOpenChange,
}: {
  provider: IntegrationProviderKey;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const meta = PROVIDER_META[provider];
  const connectKey = useConnectApiKeyIntegration();
  const [apiKey, setApiKey] = useState("");
  const [userId, setUserId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (!apiKey.trim()) {
      setError("API key wajib diisi.");
      return;
    }
    try {
      await connectKey.mutateAsync({
        provider,
        apiKey: apiKey.trim(),
        userId: userId.trim() || undefined,
      });
      setApiKey("");
      setUserId("");
      onOpenChange(false);
    } catch (err) {
      setError(readableApiErrorMessage(err, "Gagal menghubungkan akun."));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Hubungkan {meta.label}</DialogTitle>
          <DialogDescription>
            Tempel API key {meta.label} kamu. Buat key dengan akses baca di{" "}
            <Link
              href={meta.helpUrl}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2"
            >
              pengaturan {meta.label}
            </Link>
            .
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <label className="grid gap-1.5">
            <span className="text-[12px] font-semibold text-foreground">API key</span>
            <Input
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder="Contoh: P9NiFoyLeZu2bZNvvuQPDWsd"
              autoComplete="off"
              autoFocus
            />
          </label>
          <label className="grid gap-1.5">
            <span className="text-[12px] font-semibold text-foreground">
              User ID <span className="font-normal text-muted-foreground">(opsional)</span>
            </span>
            <Input
              value={userId}
              onChange={(event) => setUserId(event.target.value)}
              placeholder="Terdeteksi otomatis dari API key"
              autoComplete="off"
            />
          </label>
          {error ? <p className="text-[12px] font-medium text-destructive">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button type="button" onClick={submit} disabled={connectKey.isPending}>
            {connectKey.isPending ? "Menghubungkan…" : "Hubungkan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
