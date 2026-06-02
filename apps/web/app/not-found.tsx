import { ErrorStatePage } from "@/components/error-state-page";
import { createPageMetadata } from "@/lib/metadata";

export const metadata = createPageMetadata({
  title: "Halaman tidak ditemukan",
  description:
    "Halaman yang kamu cari tidak tersedia. Kembali ke workspace Aqsha untuk melanjutkan risetmu.",
});

export default function NotFound() {
  return (
    <ErrorStatePage
      description="Halaman yang kamu cari tidak tersedia. Tautannya mungkin berubah, dipindahkan, atau tidak lagi bisa diakses. Kembali ke workspace untuk lanjut dari tempat yang jelas."
      eyebrow="404"
      imageAlt="Ilustrasi halaman tidak ditemukan"
      imageSrc="/not-found.png"
      primaryAction={{ label: "Workspace", href: "/app" }}
      secondaryAction={{ label: "Kembali", behavior: "back" }}
      title="Halaman tidak ditemukan"
    />
  );
}
