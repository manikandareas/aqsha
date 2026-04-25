"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ArrowRight, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

export default function SignUpPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await authClient.signUp.email({
        name,
        email,
        password,
      });

      if (response.error) {
        setError(response.error.message ?? "Sign up failed.");
        return;
      }

      router.push("/get-started");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sign up failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
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
          name="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoComplete="name"
          required
        />
      </div>

      <div className="mt-4 space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
          required
        />
      </div>

      <div className="mt-4 space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="new-password"
          minLength={8}
          required
        />
      </div>

      {error ? (
        <p className="mt-4 rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm leading-5 text-destructive">
          {error}
        </p>
      ) : null}

      <Button type="submit" className="mt-6 h-10 w-full" disabled={isSubmitting}>
        {isSubmitting ? (
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
