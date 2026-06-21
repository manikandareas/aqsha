"use client";

import Link from "next/link";
import { Badge } from "@aqsha/ui/components/badge";
import { Button } from "@aqsha/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@aqsha/ui/components/card";
import { ArrowUpRightIcon, Loader2Icon } from "@aqsha/ui/icons";
import { useBillingCurrent, useProfile, useUsageActivity } from "../api";
import { CreditMeter, UsageChart } from "./bits";

export function SettingsOverviewPage() {
  const billing = useBillingCurrent();
  const usage = useUsageActivity(365);
  const profile = useProfile();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl">Ringkasan</h1>
        <p className="text-sm text-muted-foreground">
          Halo{profile.data?.name ? `, ${profile.data.name}` : ""} — pantau paket dan penggunaan kamu.
        </p>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
          <div>
            <CardTitle>Paket aktif</CardTitle>
            <CardDescription>{billing.data ? billing.data.planLabel : "Memuat…"}</CardDescription>
          </div>
          {billing.data ? (
            <Badge variant={billing.data.planKey === "free" ? "secondary" : "default"}>
              {billing.data.isAdmin ? "Admin" : billing.data.status}
            </Badge>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-4">
          {billing.isPending ? (
            <div className="flex justify-center py-6 text-muted-foreground">
              <Loader2Icon className="size-5 animate-spin" />
            </div>
          ) : billing.data ? (
            <CreditMeter
              creditsUsed={billing.data.creditsUsed}
              creditsLimit={billing.data.creditsLimit}
              creditsRemaining={billing.data.creditsRemaining}
              unlimited={billing.data.isUnlimitedCredits}
              resetAt={billing.data.resetAt}
            />
          ) : (
            <p className="text-sm text-muted-foreground">Tidak dapat memuat billing.</p>
          )}
          <Button asChild variant="outline" size="sm">
            <Link href="/app/settings/usage-billing">
              Kelola langganan
              <ArrowUpRightIcon className="size-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Penggunaan</CardTitle>
          <CardDescription>Kredit terpakai per hari (365 hari terakhir)</CardDescription>
        </CardHeader>
        <CardContent>
          {usage.isPending ? (
            <div className="flex justify-center py-6 text-muted-foreground">
              <Loader2Icon className="size-5 animate-spin" />
            </div>
          ) : usage.data ? (
            <UsageChart days={usage.data} />
          ) : (
            <p className="text-sm text-muted-foreground">Tidak dapat memuat penggunaan.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Percakapan</CardTitle>
          <CardDescription>Total percakapan dengan Astra</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-semibold tabular-nums text-muted-foreground">—</p>
          <p className="text-xs text-muted-foreground">Tersedia setelah chat Astra aktif.</p>
        </CardContent>
      </Card>
    </div>
  );
}
