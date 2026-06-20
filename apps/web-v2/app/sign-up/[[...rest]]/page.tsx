import { SignUp } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export default async function SignUpPage() {
  const { isAuthenticated } = await auth();
  if (isAuthenticated) {
    redirect("/app");
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-5 py-10">
      <SignUp path="/sign-up" routing="path" signInUrl="/sign-in" fallbackRedirectUrl="/app" />
    </main>
  );
}
