import { SettingsUsageBillingPage } from "@/features/settings/pages/usage-billing-page";

export default async function UsageBillingPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string | string[] }>;
}) {
  const checkout = (await searchParams).checkout;
  const checkoutStatus = Array.isArray(checkout) ? checkout[0] : checkout;

  return <SettingsUsageBillingPage checkoutStatus={checkoutStatus} />;
}
