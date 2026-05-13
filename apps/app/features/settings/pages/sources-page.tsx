"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { MetricCard, SettingRow, SettingsCard, SettingsSectionLabel } from "../components/settings-card";
import { LoadingSettingsPage, SettingsHeader, useSettingsData } from "./shared";

export function SettingsSourcesPage() {
  const { sources, sourceSummary } = useSettingsData();
  if (!sources) return <LoadingSettingsPage />;

  return (
    <>
      <SettingsHeader section="sources" />
      <div className="grid gap-4">
        <SettingsSectionLabel>Source Library</SettingsSectionLabel>
        <SettingsCard>
          <SettingRow label="Saved sources" description="Status corpus yang bisa dipakai untuk cited answer.">
            <div className="grid min-w-[320px] grid-cols-3 gap-2">
              <MetricCard label="Ready" value={sourceSummary.ready} tone="mint" />
              <MetricCard label="Metadata" value={sourceSummary.metadataOnly} tone="lemon" />
              <MetricCard label="Failed" value={sourceSummary.failed} tone="coral" />
            </div>
          </SettingRow>
          <SettingRow label="Manage library" description="Tambah DOI, arXiv, URL, atau teks manual.">
            <Button asChild className="rounded-[8px]">
              <Link href="/sources">Buka Sources</Link>
            </Button>
          </SettingRow>
        </SettingsCard>
      </div>
    </>
  );
}
