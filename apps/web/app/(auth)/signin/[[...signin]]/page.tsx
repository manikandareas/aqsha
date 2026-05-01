"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { ArrowRight, Loader2 } from "lucide-react";

import { AuthField, AuthScreen } from "@/components/auth/auth-screen";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { toast } from "@/lib/toast";

const signInSchema = z.object({
  email: z.string().trim().email("Enter a valid email."),
  password: z.string().min(1, "Password is required."),
});

type SignInFormValues = z.infer<typeof signInSchema>;

export default function SignInPage() {
  const router = useRouter();
  const form = useForm<SignInFormValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  async function handleSubmit(values: SignInFormValues): Promise<void> {
    form.clearErrors("root");

    try {
      const response = await authClient.signIn.email({
        email: values.email,
        password: values.password,
      });

      if (response.error) {
        toast.error({
          title: "Could not sign in",
          description: response.error.message ?? "Sign in failed.",
        });
        return;
      }

      toast.success({
        title: "Signed in",
        description: "Welcome back to Aqsha.",
      });
      router.push("/get-started");
      router.refresh();
    } catch (cause) {
      toast.error({
        title: "Could not sign in",
        description: cause instanceof Error ? cause.message : "Sign in failed.",
      });
    }
  }

  return (
    <form onSubmit={form.handleSubmit(handleSubmit)}>
      <AuthScreen
        mode="signin"
        title="Your product docs are ready when you are."
        description="Sign in to continue writing, organizing, and sharing what your team knows."
        switchPrompt="New to Aqsha?"
        switchHref="/signup"
        switchLabel="Create an account"
        termsCopy={
          <>
            By continuing, you agree to Aqsha&apos;s{" "}
            <Link
              className="text-foreground underline underline-offset-4"
              href="/terms"
            >
              Terms
            </Link>{" "}
            and{" "}
            <Link
              className="text-foreground underline underline-offset-4"
              href="/privacy"
            >
              Privacy Policy
            </Link>
            .
          </>
        }
        submit={
          <Button
            type="submit"
            className="mt-5 h-10 w-full rounded-md bg-notion-warm-dark text-[0.8125rem] font-medium text-white hover:bg-foreground"
            disabled={form.formState.isSubmitting}
          >
            {form.formState.isSubmitting ? (
              <>
                <Loader2 className="animate-spin" aria-hidden="true" />
                Signing in
              </>
            ) : (
              <>
                Sign in
                <ArrowRight aria-hidden="true" />
              </>
            )}
          </Button>
        }
      >
        <div className="space-y-4">
          <AuthField>
            <Label htmlFor="email" className="sr-only">
              Email
            </Label>
            <Input
              id="email"
              type="email"
              placeholder="Email"
              className="h-10 rounded-md border-border bg-background px-3 text-[0.8125rem] shadow-none placeholder:text-notion-gray-300"
              {...form.register("email", {
                onChange: () => form.clearErrors("root"),
              })}
              autoComplete="email"
              aria-invalid={Boolean(form.formState.errors.email)}
            />
            {form.formState.errors.email ? (
              <p className="text-sm text-destructive">
                {form.formState.errors.email.message}
              </p>
            ) : null}
          </AuthField>

          <AuthField>
            <Label htmlFor="password" className="sr-only">
              Password
            </Label>
            <Input
              id="password"
              type="password"
              placeholder="Password"
              className="h-10 rounded-md border-border bg-background px-3 text-[0.8125rem] shadow-none placeholder:text-notion-gray-300"
              {...form.register("password", {
                onChange: () => form.clearErrors("root"),
              })}
              autoComplete="current-password"
              aria-invalid={Boolean(form.formState.errors.password)}
            />
            {form.formState.errors.password ? (
              <p className="text-sm text-destructive">
                {form.formState.errors.password.message}
              </p>
            ) : null}
          </AuthField>
        </div>
      </AuthScreen>
    </form>
  );
}
