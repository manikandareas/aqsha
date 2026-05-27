"use client";

import { useState } from "react";
import { Loader2Icon, MailCheckIcon, SendIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { useDraftField } from "../lib/use-draft-field";
import {
  SettingsField,
  SettingsPanelBody,
  SettingsPanelFooter,
} from "./settings-card";

export function EmailChangePanel({ savedEmail }: { savedEmail: string | null }) {
  const { saved, draft, setDraft } = useDraftField(savedEmail);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const trimmedDraft = draft.trim().toLowerCase();
  const canSend = trimmedDraft.length > 0 && trimmedDraft !== saved.toLowerCase() && !pending;

  const submit = async () => {
    if (!canSend) return;
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      const origin = window.location.origin;
      const result = await authClient.changeEmail({
        newEmail: trimmedDraft,
        callbackURL: `${origin}/settings/account?email=changed`,
      });
      if (result.error) {
        throw new Error(result.error.message ?? "Gagal mengirim konfirmasi email.");
      }
      setMessage("Cek email lama kamu untuk mengonfirmasi perubahan alamat email.");
    } catch (changeError) {
      const detail =
        changeError instanceof Error ? changeError.message : "Gagal mengubah alamat email.";
      setError(detail);
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <SettingsPanelBody className="grid gap-5">
        <SettingsField
          label="Alamat email"
          description="Perubahan email dikonfirmasi lewat alamat email yang sedang aktif."
        >
          <div className="grid gap-2">
            <Input
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
                setError(null);
                setMessage(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void submit();
                }
              }}
              disabled={pending}
              type="email"
              autoComplete="email"
              className="h-[42px] rounded-lg border-input bg-muted/40 px-3.5 text-[13px] shadow-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
            />
            {message ? (
              <p className="flex items-center gap-1.5 text-[12px] text-mint-foreground">
                <MailCheckIcon className="size-3.5" />
                {message}
              </p>
            ) : null}
            {error ? <p className="text-[12px] text-coral-foreground">{error}</p> : null}
          </div>
        </SettingsField>
      </SettingsPanelBody>
      <SettingsPanelFooter>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={!canSend}
          onClick={() => void submit()}
        >
          {pending ? (
            <Loader2Icon className="size-3.5 animate-spin text-primary" />
          ) : (
            <SendIcon className="size-3.5 text-primary" />
          )}
          Kirim konfirmasi
        </Button>
      </SettingsPanelFooter>
    </>
  );
}
