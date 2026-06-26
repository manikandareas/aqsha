import { SignUp } from "@clerk/nextjs";
import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/auth-server";
import { createPageMetadata } from "@/lib/metadata";

export const metadata = createPageMetadata({
  title: "Create account",
  description: "Create an Aqsha account to start building research workspaces.",
});

export default async function SignUpPage() {
  if (await isAuthenticated()) {
    redirect("/app");
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-5 py-10">
      <SignUp
        path="/sign-up"
        routing="path"
        signInUrl="/sign-in"
        forceRedirectUrl="/onboarding"
        fallbackRedirectUrl="/onboarding"
      />
    </main>
  );
}
