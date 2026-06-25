"use client";

import { useEffect } from "react";

import { ErrorStatePage } from "@/components/error-state-page";

type ErrorPageProps = {
  error: Error & { digest?: string };
  unstable_retry: () => void;
};

export default function ErrorPage({ error, unstable_retry }: ErrorPageProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
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
  );
}
