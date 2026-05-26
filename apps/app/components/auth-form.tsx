"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useQuery } from "convex/react";
import { GitBranchIcon, GlobeIcon } from "lucide-react";
import { api } from "@aqsha/convex/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

type AuthMode = "sign-in" | "sign-up";

export function AuthForm({ mode }: { mode: AuthMode }) {
  const router = useRouter();
  const capabilities = useQuery(api.auth.getPublicAuthCapabilities, {});
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [socialPending, setSocialPending] = useState<"github" | "google" | null>(null);

  const isSignUp = mode === "sign-up";
  const availableSocialProviders = [
    { key: "github", label: "GitHub", icon: GitBranchIcon },
    { key: "google", label: "Google", icon: GlobeIcon },
  ].filter((provider) => capabilities?.oauthProviders[provider.key as "github" | "google"]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsPending(true);
    setError(null);

    const result = isSignUp
      ? await authClient.signUp.email({
          name,
          email,
          password,
        })
      : await authClient.signIn.email({
          email,
          password,
        });

    setIsPending(false);

    if (result.error) {
      setError(result.error.message ?? "Authentication failed");
      return;
    }

    router.replace("/");
    router.refresh();
  };

  const signInSocial = async (provider: "github" | "google") => {
    setSocialPending(provider);
    setError(null);
    const result = await authClient.signIn.social({
      provider,
      callbackURL: `${window.location.origin}/`,
      errorCallbackURL: `${window.location.origin}/sign-in`,
      disableRedirect: true,
    });
    if (result.error) {
      setError(result.error.message ?? "Social sign in failed");
      setSocialPending(null);
      return;
    }
    if (result.data?.url) {
      window.location.assign(result.data.url);
      return;
    }
    setSocialPending(null);
  };

  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-5 py-10">
      <section className="w-full max-w-[420px] rounded-[18px] border bg-card p-6 shadow-aqsha sm:p-8">
        <div className="mb-7 grid gap-2">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-[10px] bg-primary text-sm font-semibold text-primary-foreground">
              A
            </div>
            <div>
              <p className="font-heading text-lg font-bold">Aqsha</p>
              <p className="text-xs font-medium text-muted-foreground">
                Research thread app
              </p>
            </div>
          </div>
          <h1 className="font-heading pt-5 text-3xl font-bold leading-tight">
            {isSignUp ? "Create your account" : "Sign in to Aqsha"}
          </h1>
        </div>

        <form onSubmit={submit} className="grid gap-4">
          {isSignUp ? (
            <div className="grid gap-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                autoComplete="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
              />
            </div>
          ) : null}

          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>

          <div className="grid gap-2">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="password">Password</Label>
              {!isSignUp ? (
                <Link
                  href="/reset-password"
                  className="text-xs font-semibold text-primary hover:underline"
                >
                  Lupa password?
                </Link>
              ) : null}
            </div>
            <Input
              id="password"
              type="password"
              autoComplete={isSignUp ? "new-password" : "current-password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={8}
              required
            />
          </div>

          {error ? (
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
              {error}
            </p>
          ) : null}

          <Button type="submit" size="lg" disabled={isPending}>
            {isPending
              ? "Please wait..."
              : isSignUp
                ? "Create account"
                : "Sign in"}
          </Button>
        </form>

        {availableSocialProviders.length > 0 ? (
          <div className="mt-5 grid gap-3">
            <div className="flex items-center gap-3 text-xs font-medium text-muted-foreground">
              <span className="h-px flex-1 bg-border" />
              <span>atau</span>
              <span className="h-px flex-1 bg-border" />
            </div>
            <div className="grid gap-2">
              {availableSocialProviders.map((provider) => {
                const Icon = provider.icon;
                return (
                  <Button
                    key={provider.key}
                    type="button"
                    variant="outline"
                    size="lg"
                    disabled={Boolean(socialPending)}
                    onClick={() => void signInSocial(provider.key as "github" | "google")}
                  >
                    {socialPending === provider.key ? (
                      "Please wait..."
                    ) : (
                      <>
                        <Icon className="size-4" />
                        Continue with {provider.label}
                      </>
                    )}
                  </Button>
                );
              })}
            </div>
          </div>
        ) : null}

        <p className="mt-6 text-center text-sm text-muted-foreground">
          {isSignUp ? "Already have an account?" : "New to Aqsha?"}{" "}
          <Link
            href={isSignUp ? "/sign-in" : "/sign-up"}
            className="font-semibold text-primary hover:underline"
          >
            {isSignUp ? "Sign in" : "Create account"}
          </Link>
        </p>
      </section>
    </main>
  );
}
