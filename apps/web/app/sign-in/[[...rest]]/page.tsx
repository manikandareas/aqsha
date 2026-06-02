import { SignIn } from "@clerk/nextjs";
import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/auth-server";
import { createPageMetadata } from "@/lib/metadata";

export const metadata = createPageMetadata({
  title: "Sign in",
  description: "Sign in to continue researching with Aqsha.",
});

export default async function SignInPage() {
  if (await isAuthenticated()) {
    redirect("/app");
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-5 py-10">
      <SignIn
        path="/sign-in"
        routing="path"
        signUpUrl="/sign-up"
        fallbackRedirectUrl="/app"
      />
    </main>
  );
}
