"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { ArrowRight, Loader2 } from "lucide-react";

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
    <form
      onSubmit={form.handleSubmit(handleSubmit)}
      className="w-full max-w-sm rounded-xl border border-border bg-background p-6 shadow-soft-card"
    >
      <h1 className="text-card-title font-bold leading-tight tracking-card-title">
        Sign in
      </h1>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        Continue to your Aqsha workspace.
      </p>

      <div className="mt-6 space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
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
      </div>

      <div className="mt-4 space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
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
      </div>

      <Button
        type="submit"
        className="mt-6 h-10 w-full"
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

      <p className="mt-4 text-center text-sm text-muted-foreground">
        No account?{" "}
        <Link className="font-semibold text-foreground underline" href="/signup">
          Sign up
        </Link>
      </p>
    </form>
  );
}
