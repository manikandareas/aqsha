import type { ReactNode } from "react";
import { SettingsRail } from "@/features/settings/components/settings-rail";

/** Shell settings: rail navigasi + konten. Auth/onboarding sudah di-gate `app/app/layout.tsx`. */
export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-10">
      <div className="flex flex-col gap-8 md:flex-row">
        <SettingsRail />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </main>
  );
}
