import { createPageMetadata } from "@/lib/metadata";

import { LandingPage } from "@/features/marketing/components/landing-page";
import { StructuredData } from "@/features/marketing/components/structured-data";

export const metadata = createPageMetadata({
  title: "Asisten AI buat skripsi, tesis & paper",
  description:
    "Aqsha ngecek tiap sumber ke paper aslinya — jadi kamu nggak ketahuan pas sidang atau direview dosen. Cari jurnal, nulis bareng Astra, semua di satu tempat.",
  path: "/",
});

export default function PublicLandingPage() {
  return (
    <main className="min-h-svh bg-background text-foreground">
      <StructuredData />
      <LandingPage />
    </main>
  );
}
