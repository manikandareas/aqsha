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

const signUpSchema = z.object({
  name: z.string().trim().min(1, "Name is required."),
  email: z.string().trim().email("Enter a valid email."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

type SignUpFormValues = z.infer<typeof signUpSchema>;

export default function SignUpPage() {
  const router = useRouter();
  const form = useForm<SignUpFormValues>({
    resolver: zodResolver(signUpSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
    },
  });

  async function handleSubmit(values: SignUpFormValues): Promise<void> {
    form.clearErrors("root");

    try {
      const response = await authClient.signUp.email({
        name: values.name,
        email: values.email,
        password: values.password,
      });

      if (response.error) {
        form.setError("root", {
          message: response.error.message ?? "Sign up failed.",
        });
        return;
      }

      router.push("/get-started");
      router.refresh();
    } catch (cause) {
      form.setError("root", {
        message: cause instanceof Error ? cause.message : "Sign up failed.",
      });
    }
  }

  return (
    <form
      onSubmit={form.handleSubmit(handleSubmit)}
      className="w-full max-w-sm rounded-xl border border-border bg-background p-6 shadow-soft-card"
    >
      <h1 className="text-card-title font-bold leading-tight tracking-card-title">
        Create account
      </h1>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        Start with email and password.
      </p>

      <div className="mt-6 space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          {...form.register("name", {
            onChange: () => form.clearErrors("root"),
          })}
          autoComplete="name"
          aria-invalid={Boolean(form.formState.errors.name)}
        />
        {form.formState.errors.name ? (
          <p className="text-sm text-destructive">
            {form.formState.errors.name.message}
          </p>
        ) : null}
      </div>

      <div className="mt-4 space-y-2">
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
          autoComplete="new-password"
          aria-invalid={Boolean(form.formState.errors.password)}
        />
        {form.formState.errors.password ? (
          <p className="text-sm text-destructive">
            {form.formState.errors.password.message}
          </p>
        ) : null}
      </div>

      {form.formState.errors.root ? (
        <p className="mt-4 rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm leading-5 text-destructive">
          {form.formState.errors.root.message}
        </p>
      ) : null}

      <Button
        type="submit"
        className="mt-6 h-10 w-full"
        disabled={form.formState.isSubmitting}
      >
        {form.formState.isSubmitting ? (
          <>
            <Loader2 className="animate-spin" aria-hidden="true" />
            Creating account
          </>
        ) : (
          <>
            Sign up
            <ArrowRight aria-hidden="true" />
          </>
        )}
      </Button>

      <p className="mt-4 text-center text-sm text-muted-foreground">
        Have an account?{" "}
        <Link className="font-semibold text-foreground underline" href="/signin">
          Sign in
        </Link>
      </p>
    </form>
  );
}
