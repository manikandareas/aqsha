import { redirect } from "next/navigation";
import { SignIn } from "@clerk/nextjs";
import { isAuthenticated } from "@/lib/auth-server";

export default async function SignInPage() {
  if (await isAuthenticated()) {
    redirect("/");
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-5 py-10">
      <SignIn
        path="/sign-in"
        routing="path"
        signUpUrl="/sign-up"
        fallbackRedirectUrl="/"
      />
    </main>
  );
}
