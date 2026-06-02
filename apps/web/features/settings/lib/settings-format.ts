import { readableConvexError } from "@/lib/convex-error";

const idrFormatter = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

export function formatIdr(value: number) {
  if (value === 0) return "Rp0";
  return idrFormatter.format(value);
}

export function formatShortDate(value: number) {
  return new Date(value).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
  });
}

export function getInitials(name: string, email: string) {
  const source = name === "Aqsha user" ? email : name;
  return source
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function readableBillingError(error: unknown) {
  const { message, code } = readableConvexError(error, "Billing action belum bisa dibuat.");
  if (code === "billing_email_invalid") {
    return "Email ini belum bisa dipakai untuk pembayaran. Gunakan email aktif lain lalu coba lagi.";
  }
  if (code === "billing_product_not_configured") {
    return "Pembayaran belum bisa dibuka saat ini. Coba lagi sebentar.";
  }
  if (message.includes("real email domain") || message.includes("valid email")) {
    return "Email ini belum bisa dipakai untuk pembayaran. Gunakan email aktif lain lalu coba lagi.";
  }
  if (message.includes("not configured")) {
    return "Pembayaran belum bisa dibuka saat ini. Coba lagi sebentar.";
  }
  return "Permintaan pembayaran belum bisa diproses. Coba lagi sebentar.";
}
