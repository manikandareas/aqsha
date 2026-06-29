"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@aqsha/ui/components/dropdown-menu";
import { ChevronDownIcon, LockIcon } from "@aqsha/ui/icons";
import Image from "next/image";
import { useRouter } from "next/navigation";
import type { AgentKind } from "@aqsha/chat-core";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useBillingCurrent } from "@/features/settings/api";

/** Tier agen di composer — alias kontrak bersama `AgentKind` (`@aqsha/chat-core`), nama lokal dipertahankan. */
export type ComposerAgentKind = AgentKind;

/**
 * Pilihan agen composer. Default mengikuti tier thread yang TERSIMPAN
 * (`chat_threads.agent_kind`, di-update proyeksi server tiap turn): buka thread yang dimulai
 * dengan Pro → selektor default Pro. Thread baru / belum ada baris → "lite". `threadDefault` dibaca
 * SEKALI di surface (`MastraChatInner`, gated thread existing) lalu diteruskan ke sini → tak ada GET
 * `/threads/<uuid>` untuk thread baru (id klien yang belum punya baris server).
 *
 * `override` = pilihan eksplisit user untuk SESI ini (menimpa default thread); null = ikut default.
 * Composer di-remount per `threadId` (key di surface) → override reset saat pindah thread, jadi
 * default kembali ikut tier thread. Tier "menempel" hanya SETELAH sebuah turn dijalankan (proyeksi
 * yang menulis `agent_kind`), bukan saat selektor digeser. Pro TERKUNCI kecuali plan berbayar; klik
 * Pro saat terkunci → arahkan ke billing; `agentKind` dipaksa "lite" untuk plan free.
 */
export function useComposerAgentSelection(threadDefault: ComposerAgentKind = "lite") {
  const router = useRouter();
  const billing = useBillingCurrent();
  const canUsePro = billing.data ? billing.data.planKey !== "free" : false;
  const [override, setOverride] = useState<ComposerAgentKind | null>(null);
  const selected = override ?? threadDefault;

  return {
    agentKind: canUsePro ? selected : ("lite" as const),
    canUsePro,
    setAgentKind: (kind: ComposerAgentKind) => setOverride(kind),
    handleUpgrade: () => router.push("/app/settings/usage-billing"),
  };
}

export function AgentSelector({
  agentKind,
  setAgentKind,
  canUsePro,
  onUpgrade,
  disabled,
}: {
  agentKind: ComposerAgentKind;
  setAgentKind: (agentKind: ComposerAgentKind) => void;
  canUsePro: boolean;
  onUpgrade: () => void;
  disabled?: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-full bg-muted/20 px-2.5 py-1 font-semibold text-[11px] text-muted-foreground transition-all duration-150 hover:bg-muted/40 hover:text-foreground disabled:opacity-50"
        >
          <Image
            src={agentKind === "pro" ? "/pro-agent.png" : "/general-agent.png"}
            alt=""
            width={16}
            height={16}
            className="size-4 rounded-full object-cover"
          />
          <span>{agentKind === "pro" ? "Pro" : "Lite"}</span>
          <ChevronDownIcon className="size-3 text-muted-foreground/60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem
          onClick={() => setAgentKind("lite")}
          className={cn("gap-2 rounded-lg", agentKind === "lite" && "bg-sky-soft/60 font-medium")}
        >
          <Image
            src="/general-agent.png"
            alt=""
            width={20}
            height={20}
            className="size-5 rounded-full object-cover"
          />
          <span className="font-semibold text-[11px]">Astra Lite</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            if (canUsePro) setAgentKind("pro");
            else onUpgrade();
          }}
          className={cn("gap-2 rounded-lg", agentKind === "pro" && "bg-sky-soft/60 font-medium")}
        >
          <Image
            src="/pro-agent.png"
            alt=""
            width={20}
            height={20}
            className="size-5 rounded-full object-cover"
          />
          <span className="font-semibold text-[11px]">Astra Pro</span>
          {!canUsePro ? <LockIcon className="ml-auto size-3 text-muted-foreground/70" /> : null}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
