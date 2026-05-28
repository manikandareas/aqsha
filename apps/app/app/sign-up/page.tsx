import { redirect } from "next/navigation";
import { SignUp } from "@clerk/nextjs";
import { isAuthenticated } from "@/lib/auth-server";

export default async function SignUpPage() {
  if (await isAuthenticated()) {
    redirect("/");
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-5 py-10">
      <SignUp
        path="/sign-up"
        routing="path"
        signInUrl="/sign-in"
        fallbackRedirectUrl="/"
      />
    </main>
  );
}
