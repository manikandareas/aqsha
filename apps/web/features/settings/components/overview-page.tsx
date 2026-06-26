"use client";

import Link from "next/link";
import { Button } from "@aqsha/ui/components/button";
import { ArrowUpRightIcon } from "@aqsha/ui/icons";
import { useBillingCurrent, useProfile, useUsageActivity } from "../api";
import { CreditMeter, UsageChart } from "./bits";
import {
  SettingsPanel,
  SettingsPanelBody,
  SettingsPanelFooter,
  SettingsPanelHeader,
  SettingsPill,
} from "./settings-card";
import { SettingsHeader } from "./settings-header";

export function SettingsOverviewPage() {
  const billing = useBillingCurrent();
  const usage = useUsageActivity(365);
  const profile = useProfile();

  return (
    <>
      <SettingsHeader
        section="overview"
        title="Ringkasan"
        description={
          profile.data?.name
            ? `Halo, ${profile.data.name} — pantau paket dan penggunaan kamu.`
            : "Pantau paket dan penggunaan kamu."
        }
      />

      <SettingsPanel>
        <SettingsPanelHeader
          title="Paket aktif"
          description={billing.data?.planLabel ?? "Memuat…"}
          action={
            billing.data ? (
              <SettingsPill>{billing.data.isAdmin ? "Admin" : billing.data.status}</SettingsPill>
            ) : null
          }
        />
        <SettingsPanelBody>
          {billing.isPending ? (
            <p className="text-[13px] text-muted-foreground">Memuat billing…</p>
          ) : billing.data ? (
            <CreditMeter
              creditsUsed={billing.data.creditsUsed}
              creditsLimit={billing.data.creditsLimit}
              creditsRemaining={billing.data.creditsRemaining}
              unlimited={billing.data.isUnlimitedCredits}
              resetAt={billing.data.resetAt}
            />
          ) : (
            <p className="text-[13px] text-muted-foreground">Tidak dapat memuat billing.</p>
          )}
        </SettingsPanelBody>
        <SettingsPanelFooter>
          <Button asChild variant="outline" size="sm">
            <Link href="/app/settings/usage-billing">
              Kelola langganan
              <ArrowUpRightIcon className="size-4" />
            </Link>
          </Button>
        </SettingsPanelFooter>
      </SettingsPanel>

      <SettingsPanel>
        <SettingsPanelHeader title="Penggunaan" description="Kredit terpakai per hari (365 hari terakhir)" />
        <SettingsPanelBody>
          {usage.isPending ? (
            <p className="text-[13px] text-muted-foreground">Memuat penggunaan…</p>
          ) : usage.data ? (
            <UsageChart days={usage.data} />
          ) : (
            <p className="text-[13px] text-muted-foreground">Tidak dapat memuat penggunaan.</p>
          )}
        </SettingsPanelBody>
      </SettingsPanel>

      <SettingsPanel>
        <SettingsPanelHeader title="Percakapan" description="Total percakapan dengan Astra" />
        <SettingsPanelBody>
          <p className="font-heading text-[2rem] font-bold leading-none tabular-nums text-muted-foreground">—</p>
          <p className="mt-2 text-[12px] text-muted-foreground">Tersedia setelah chat Astra aktif.</p>
        </SettingsPanelBody>
      </SettingsPanel>
    </>
  );
}
