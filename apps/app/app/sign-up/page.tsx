import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { isAuthenticated } from "@/lib/auth-server";

export default async function SignUpPage() {
  if (await isAuthenticated()) {
    redirect("/");
  }

  return <AuthForm mode="sign-up" />;
}
