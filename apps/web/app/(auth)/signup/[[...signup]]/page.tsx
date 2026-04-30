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
        toast.error({
          title: "Could not create account",
          description: response.error.message ?? "Sign up failed.",
        });
        return;
      }

      toast.success({
        title: "Account created",
        description: "Continue setting up your workspace.",
      });
      router.push("/get-started");
      router.refresh();
    } catch (cause) {
      toast.error({
        title: "Could not create account",
        description: cause instanceof Error ? cause.message : "Sign up failed.",
      });
    }
  }

  return (
    <form onSubmit={form.handleSubmit(handleSubmit)}>
      <AuthScreen
        mode="signup"
        title="A better place for product docs."
        description="Create an account for specs, decisions, and notes your team can find again."
        switchPrompt="Already have an account?"
        switchHref="/signin"
        switchLabel="Sign in"
        termsCopy={
          <>
            By creating an account, you agree to Aqsha&apos;s{" "}
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
                Creating account
              </>
            ) : (
              <>
                Sign up
                <ArrowRight aria-hidden="true" />
              </>
            )}
          </Button>
        }
      >
        <div className="space-y-4">
          <AuthField>
            <Label htmlFor="name" className="sr-only">
              Name
            </Label>
            <Input
              id="name"
              placeholder="Name"
              className="h-10 rounded-md border-border bg-background px-3 text-[0.8125rem] shadow-none placeholder:text-notion-gray-300"
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
          </AuthField>

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
              autoComplete="new-password"
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
