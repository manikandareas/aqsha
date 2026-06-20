import { SignIn } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export default async function SignInPage() {
  const { isAuthenticated } = await auth();
  if (isAuthenticated) {
    redirect("/app");
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-5 py-10">
      <SignIn path="/sign-in" routing="path" signUpUrl="/sign-up" fallbackRedirectUrl="/app" />
    </main>
  );
}
