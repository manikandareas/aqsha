import { SettingsUsageBillingPage } from "@/features/settings/pages/usage-billing-page";
import { createPageMetadata } from "@/lib/metadata";

export const metadata = createPageMetadata({
  title: "Penggunaan & tagihan",
  description: "Pantau kredit, paket, dan portal pembayaran Aqsha.",
});

export default async function UsageBillingPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string | string[] }>;
}) {
  const checkout = (await searchParams).checkout;
  const checkoutStatus = Array.isArray(checkout) ? checkout[0] : checkout;

  return <SettingsUsageBillingPage checkoutStatus={checkoutStatus} />;
}
