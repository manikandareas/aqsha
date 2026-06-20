"use client";

import { ChevronDownIcon, LockIcon } from "@aqsha/ui/icons";
import { api } from "@aqsha/convex/api";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useConvexQueryData } from "@/lib/convex-query";
import { cn } from "@/lib/utils";
import { useConvexAuth } from "convex/react";

export type ComposerAgentKind = "lite" | "pro";

export function useComposerAgentSelection({
  initialAgentKind,
  onUpgrade,
}: {
  initialAgentKind?: ComposerAgentKind;
  onUpgrade?: () => void;
}) {
  const router = useRouter();
  const { isAuthenticated } = useConvexAuth();
  const billingCurrent = useConvexQueryData(
    api.billing.current.get,
    isAuthenticated ? {} : "skip",
  );
  const canUsePro = billingCurrent ? billingCurrent.planKey !== "free" : false;
  const [selectedAgentKind, setSelectedAgentKind] = useState<ComposerAgentKind>(
    initialAgentKind ?? "lite",
  );
  const [syncedInitialAgentKind, setSyncedInitialAgentKind] =
    useState(initialAgentKind);

  if (initialAgentKind !== syncedInitialAgentKind) {
    setSyncedInitialAgentKind(initialAgentKind);
    if (initialAgentKind) {
      setSelectedAgentKind(initialAgentKind);
    }
  }

  return {
    agentKind: canUsePro ? selectedAgentKind : ("lite" as const),
    canUsePro,
    setAgentKind: setSelectedAgentKind,
    handleUpgrade:
      onUpgrade ?? (() => router.push("/app/settings/usage-billing")),
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
  onUpgrade?: () => void;
  disabled?: boolean;
}) {
  const active = getAgentSelectorPresentation(agentKind);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className="aqsha-composer-toolbar-btn inline-flex h-8 cursor-pointer items-center gap-1 rounded-full bg-muted/20 px-2.5 py-1 text-[11px] font-semibold text-muted-foreground transition-all duration-150 hover:bg-muted/40 hover:text-foreground disabled:opacity-50"
        >
          <ModeSelectorImage src={active.src} alt="" />
          <span>{active.shortLabel}</span>
          <ChevronDownIcon className="size-3 text-muted-foreground/60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem
          onClick={() => setAgentKind("lite")}
          className={cn(
            "gap-2 rounded-lg data-highlighted:bg-sky-soft/60 data-highlighted:text-foreground",
            agentKind === "lite" && "bg-sky-soft/60 font-medium text-foreground",
          )}
        >
          <ModeSelectorImage src="/general-agent.png" alt="" />
          <span className="text-[11px] font-semibold">Astra Lite</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            if (canUsePro) {
              setAgentKind("pro");
            } else {
              onUpgrade?.();
            }
          }}
          className={cn(
            "gap-2 rounded-lg data-highlighted:bg-sky-soft/60 data-highlighted:text-foreground",
            agentKind === "pro" && "bg-sky-soft/60 font-medium text-foreground",
          )}
        >
          <ModeSelectorImage src="/pro-agent.png" alt="" />
          <span className="text-[11px] font-semibold">Astra Pro</span>
          {!canUsePro ? (
            <LockIcon className="ml-auto size-3 text-muted-foreground/70" />
          ) : null}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function getAgentSelectorPresentation(agentKind: ComposerAgentKind) {
  return agentKind === "pro"
    ? { shortLabel: "Pro", src: "/pro-agent.png" }
    : { shortLabel: "Lite", src: "/general-agent.png" };
}

function ModeSelectorImage({ src, alt }: { src: string; alt: string }) {
  return (
    <span className="grid size-5 shrink-0 place-items-center overflow-hidden rounded-full bg-background">
      <Image
        src={src}
        alt={alt}
        width={20}
        height={20}
        className="size-5 object-contain"
        draggable={false}
        unoptimized
      />
    </span>
  );
}
