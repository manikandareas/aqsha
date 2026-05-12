import { redirect } from "next/navigation";
import { BillingPage } from "@/components/billing-page";
import { isAuthenticated } from "@/lib/auth-server";

export default async function Page() {
  if (!(await isAuthenticated())) {
    redirect("/sign-in");
  }

  return <BillingPage />;
}
