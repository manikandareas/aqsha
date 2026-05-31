"use client";

import { useEffect } from "react";

import { ErrorStatePage } from "@/components/error-state-page";
import "./globals.css";

type GlobalErrorPageProps = {
  error: Error & { digest?: string };
  unstable_retry: () => void;
};

export default function GlobalErrorPage({ error, unstable_retry }: GlobalErrorPageProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="id">
      <body>
        <title>Terjadi gangguan | Aqsha</title>
        <ErrorStatePage
          description="Ada bagian yang gagal dimuat. Coba lagi sebentar. Kalau masih muncul, kembali ke ruang kerja dan lanjutkan dari sana."
          eyebrow="Terjadi gangguan"
          imageAlt="Ilustrasi gangguan pemuatan"
          imageSrc="/error.png"
          primaryAction={{ label: "Coba lagi", onClick: unstable_retry }}
          referenceCode={error.digest}
          secondaryAction={{ label: "Workspace", href: "/app" }}
          title="Terjadi gangguan"
        />
      </body>
    </html>
  );
}
