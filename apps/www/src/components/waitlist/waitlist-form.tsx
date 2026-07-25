"use client";

import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { submitWaitlist, type WaitlistApiError } from "@/lib/waitlist-api";

type FormState = "idle" | "submitting" | "submitted" | "error";

export function WaitlistForm() {
  const emailId = useId();
  const companyId = useId();
  const websiteId = useId();
  const errorId = useId();

  const [email, setEmail] = useState("");
  const [companyOrUniversity, setCompanyOrUniversity] = useState("");
  const [website, setWebsite] = useState("");
  const [state, setState] = useState<FormState>("idle");
  const [error, setError] = useState<WaitlistApiError | null>(null);

  async function onSubmit(event: { preventDefault(): void }) {
    event.preventDefault();
    if (state === "submitting") return;

    setState("submitting");
    setError(null);

    try {
      await submitWaitlist({ email, companyOrUniversity, website });
      setState("submitted");
    } catch (err) {
      const apiError = err as WaitlistApiError;
      setError({
        message: apiError?.message ?? "Permintaan belum berhasil. Coba lagi.",
        code: apiError?.code,
        field: apiError?.field,
      });
      setState("error");
    }
  }

  if (state === "submitted") {
    return (
      <p className="rounded-2xl border border-border/70 bg-muted/30 px-5 py-6 text-base leading-relaxed text-foreground">
        Cek email kamu untuk mengonfirmasi pendaftaran.
      </p>
    );
  }

  const emailInvalid = error?.field === "email";
  const companyInvalid = error?.field === "companyOrUniversity";

  return (
    <form onSubmit={onSubmit} className="relative space-y-5" noValidate>
      <div className="space-y-2">
        <label htmlFor={emailId} className="block text-sm font-medium text-foreground">
          Email
        </label>
        <input
          id={emailId}
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={emailInvalid || undefined}
          aria-describedby={error ? errorId : undefined}
          className="h-12 w-full rounded-xl border border-border bg-background px-4 text-base text-foreground outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
          placeholder="nama@kampus.ac.id"
          disabled={state === "submitting"}
        />
      </div>

      <div className="space-y-2">
        <label htmlFor={companyId} className="block text-sm font-medium text-foreground">
          Perusahaan atau universitas{" "}
          <span className="font-normal text-muted-foreground">(opsional)</span>
        </label>
        <input
          id={companyId}
          name="companyOrUniversity"
          type="text"
          autoComplete="organization"
          value={companyOrUniversity}
          onChange={(e) => setCompanyOrUniversity(e.target.value)}
          aria-invalid={companyInvalid || undefined}
          aria-describedby={error ? errorId : undefined}
          className="h-12 w-full rounded-xl border border-border bg-background px-4 text-base text-foreground outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
          placeholder="Mis. Universitas Indonesia"
          disabled={state === "submitting"}
        />
      </div>

      {/* Honeypot — tersembunyi dari user; diisi bot → API mengabaikan. */}
      <div className="absolute -left-[9999px] top-auto h-0 w-0 overflow-hidden" aria-hidden="true">
        <label htmlFor={websiteId}>Website</label>
        <input
          id={websiteId}
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
        />
      </div>

      {error ? (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {error.message}
        </p>
      ) : null}

      <Button
        type="submit"
        disabled={state === "submitting"}
        className="h-12 w-full rounded-full px-7 text-base font-medium sm:w-auto"
      >
        {state === "submitting" ? "Mengirim…" : "Gabung waitlist"}
      </Button>
    </form>
  );
}
