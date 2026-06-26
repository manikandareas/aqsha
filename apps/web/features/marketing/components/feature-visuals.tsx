import {
  BookOpen,
  CheckCircle2,
  Clock3,
  FileText,
  Flag,
  Library,
  Search,
  Sparkles,
} from "@aqsha/ui/icons";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

function ProductFrame({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border border-border bg-card shadow-md",
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-border bg-muted/50 px-4 py-2.5 sm:px-5">
        <span className="text-xs font-medium text-muted-foreground sm:text-sm">
          {title}
        </span>
        <span className="size-2 rounded-full bg-emerald-500" aria-hidden />
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </div>
  );
}

export function CitationCheckVisual() {
  return (
    <ProductFrame title="Skripsi — Bab 2">
      <p className="text-sm leading-relaxed text-foreground sm:text-[15px]">
        Studi sebelumnya menunjukkan bahwa motivasi intrinsik berkorelasi positif
        dengan prestasi akademik{" "}
        <span className="rounded bg-muted px-1 font-medium text-foreground">[3]</span>
        .
      </p>
      <div className="mt-4 rounded-xl border border-border bg-muted/30 p-3.5 sm:p-4">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <div className="min-w-0">
            <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
              Cocok
            </p>
            <p className="mt-0.5 text-sm leading-snug text-muted-foreground">
              Smith et al. (2021) — kalimat ditemukan di hal. 14, paragraf 2
            </p>
          </div>
        </div>
        <div className="mt-3 flex items-start gap-3 border-t border-border pt-3">
          <Flag className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="min-w-0">
            <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
              Perlu dicek
            </p>
            <p className="mt-0.5 text-sm leading-snug text-muted-foreground">
              [7] — kutipan mirip tapi konteksnya beda
            </p>
          </div>
        </div>
      </div>
    </ProductFrame>
  );
}

export function AllInOneVisual() {
  const tabs = [
    { label: "Pencarian", icon: Search, active: false },
    { label: "Catatan", icon: FileText, active: false },
    { label: "Sumber", icon: BookOpen, active: true },
    { label: "Draf", icon: Library, active: false },
  ] as const;

  return (
    <ProductFrame title="Workspace — Tesis Psikologi">
      <div className="flex flex-wrap gap-1.5">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <span
              key={tab.label}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs sm:text-sm",
                tab.active
                  ? "bg-foreground text-background"
                  : "bg-muted text-muted-foreground",
              )}
            >
              <Icon className="size-3.5" />
              {tab.label}
            </span>
          );
        })}
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {[
          "Smith et al. (2021) — Motivasi intrinsik",
          "Chen & Lee (2019) — Prestasi akademik",
          "Catatan tinjauan pustaka",
          "Draf Bab 2 — 1.240 kata",
        ].map((item) => (
          <div
            key={item}
            className="rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-sm leading-snug text-foreground"
          >
            {item}
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs text-muted-foreground sm:text-sm">
        Semua di satu layar — nggak ada lagi 30 tab kebuka.
      </p>
    </ProductFrame>
  );
}

export function AstraAssistantVisual() {
  return (
    <ProductFrame title="Thread — Astra">
      <div className="space-y-3">
        <div className="rounded-xl bg-muted/60 px-3.5 py-3 text-sm text-muted-foreground">
          Bantu rangkum temuan utama dari 3 paper soal motivasi intrinsik.
        </div>
        <div className="rounded-xl border border-border bg-background px-3.5 py-3">
          <div className="mb-2 flex items-center gap-2">
            <Sparkles className="size-4 text-foreground" />
            <span className="text-xs font-medium text-foreground">Astra</span>
          </div>
          <ul className="space-y-2.5 text-sm leading-snug text-foreground">
            <li>
              Motivasi intrinsik berkorelasi dengan GPA{" "}
              <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                Smith 2021
              </span>
            </li>
            <li>
              Efek lebih kuat di semester awal{" "}
              <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                Chen 2019
              </span>
            </li>
            <li>
              Perlu kontrol variabel sosioekonomi{" "}
              <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                Lee 2020
              </span>
            </li>
          </ul>
        </div>
      </div>
    </ProductFrame>
  );
}

export function ProvenanceVisual() {
  const events = [
    { time: "09:14", label: "Kamu menulis paragraf pembuka Bab 2" },
    { time: "09:31", label: "Astra disuruh merapikan kalimat — kamu yang approve" },
    { time: "10:02", label: "Kutipan [3] ditambahkan dari paper Smith et al." },
    { time: "10:18", label: "Verifikasi sumber: cocok ✓" },
  ] as const;

  return (
    <ProductFrame title="Jejak penulisan">
      <div className="space-y-0">
        {events.map((event, index) => (
          <div key={event.time} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div className="flex size-7 shrink-0 items-center justify-center rounded-full border border-border bg-muted">
                <Clock3 className="size-3.5 text-muted-foreground" />
              </div>
              {index < events.length - 1 ? (
                <div className="my-1 w-px flex-1 bg-border" />
              ) : null}
            </div>
            <div className="min-w-0 pb-4">
              <p className="text-xs text-muted-foreground">{event.time}</p>
              <p className="mt-0.5 text-sm leading-snug text-foreground">{event.label}</p>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-1 rounded-lg bg-muted/50 px-3 py-2 text-xs leading-snug text-muted-foreground">
        Berguna kalau tulisan jujurmu salah dicap buatan AI — kamu punya rekam
        jejaknya.
      </p>
    </ProductFrame>
  );
}
