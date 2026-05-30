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
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("real email domain") || message.includes("valid email")) {
    return "Polar menolak email demo/reserved. Gunakan email asli lalu ulangi checkout.";
  }
  if (message.includes("not configured")) {
    return "Product Polar belum dikonfigurasi di Convex env.";
  }
  return "Billing action belum bisa dibuat. Cek konfigurasi Polar dan coba lagi.";
}
