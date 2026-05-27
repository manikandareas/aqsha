"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

export function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const errorParam = searchParams.get("error");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(
    errorParam ? "Tautan reset tidak valid atau sudah kedaluwarsa." : null,
  );
  const [isPending, setIsPending] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsPending(true);
    setError(null);
    setMessage(null);

    try {
      if (token) {
        if (password !== confirmPassword) {
          throw new Error("Konfirmasi kata sandi tidak sama.");
        }
        const result = await authClient.resetPassword({
          token,
          newPassword: password,
        });
        if (result.error) {
          throw new Error(result.error.message ?? "Gagal menyimpan kata sandi baru.");
        }
        router.replace("/sign-in?reset=success");
        router.refresh();
        return;
      }

      const result = await authClient.requestPasswordReset({
        email,
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (result.error) {
        throw new Error(result.error.message ?? "Gagal mengirim email reset.");
      }
      setMessage("Jika email terdaftar, tautan reset sudah dikirim.");
      setEmail("");
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : "Gagal memproses reset.");
    } finally {
      setIsPending(false);
    }
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
                {token ? "Create a new password" : "Reset your password"}
              </p>
            </div>
          </div>
          <h1 className="font-heading pt-5 text-3xl font-bold leading-tight">
            {token ? "Choose a new password" : "Password reset"}
          </h1>
        </div>

        <form onSubmit={submit} className="grid gap-4">
          {token ? (
            <>
              <div className="grid gap-2">
                <Label htmlFor="password">New password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  minLength={8}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="confirm-password">Confirm password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  minLength={8}
                  required
                />
              </div>
            </>
          ) : (
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
          )}

          {message ? (
            <p className="rounded-lg border border-mint-soft-border bg-mint-soft px-3 py-2 text-sm font-medium text-mint-foreground">
              {message}
            </p>
          ) : null}
          {error ? (
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
              {error}
            </p>
          ) : null}

          <Button type="submit" size="lg" disabled={isPending}>
            {isPending ? <Loader2Icon className="size-4 animate-spin" /> : null}
            {token ? "Save new password" : "Send reset link"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          <Link href="/sign-in" className="font-semibold text-primary hover:underline">
            Back to sign in
          </Link>
        </p>
      </section>
    </main>
  );
}
