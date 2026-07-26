"use client";

import { AnimatePresence, m, useReducedMotion } from "motion/react";
import { useId, useState, type ComponentProps } from "react";

import { ArrowUpRightIcon } from "@/components/icons";
import { MagneticButton } from "@/components/marketing/magnetic-button";
import { Button } from "@/components/ui/button";
import { DrawnMark } from "@/components/waitlist/drawn-mark";
import { EASE_OUT } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { submitWaitlist, type WaitlistApiError } from "@/lib/waitlist-api";

type FormState = "idle" | "submitting" | "submitted" | "error";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function isValidEmail(value: string) {
  return EMAIL_PATTERN.test(value);
}

/** Spinner CSS-only — berhenti berputar saat reduced motion. */
function Spinner() {
  return (
    <span
      aria-hidden
      className="size-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none"
    />
  );
}

/**
 * Field — satu baris input dengan label yang ikut menyala saat field fokus,
 * inset halus di dalam kontrol, dan state invalid yang memakai token
 * destructive (bukan warna mentah).
 */
function Field({
  id,
  label,
  hint,
  invalid,
  describedBy,
  disabled,
  ...input
}: {
  id: string;
  label: string;
  hint?: string;
  invalid?: boolean;
  describedBy?: string;
  disabled?: boolean;
} & ComponentProps<"input">) {
  return (
    <div className="group space-y-2">
      <label
        htmlFor={id}
        className="flex items-baseline gap-1.5 text-sm font-medium text-muted-foreground transition-colors group-focus-within:text-foreground"
      >
        {label}
        {hint ? <span className="text-xs font-normal">{hint}</span> : null}
      </label>
      <input
        {...input}
        id={id}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        className={cn(
          "ctl-inset h-12 w-full rounded-xl border-2 border-border bg-background px-4 text-base text-foreground outline-none transition-colors",
          "placeholder:text-muted-foreground/70",
          "hover:border-foreground/25",
          "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
          "aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20",
          "disabled:cursor-not-allowed disabled:opacity-60",
        )}
      />
    </div>
  );
}

/**
 * WaitlistForm — pendaftaran akses awal. Validasi email jalan di klien dulu
 * (saat blur dan saat submit) supaya koreksi datang sebelum request, error
 * server muncul dengan animasi masuk yang sama, dan sukses menggantikan form
 * dengan centang yang menggambar dirinya sendiri.
 *
 * Harus dirender di dalam `MotionProvider` (islands: WaitlistPanel).
 */
export function WaitlistForm() {
  const reduce = useReducedMotion();
  const emailId = useId();
  const companyId = useId();
  const websiteId = useId();
  const errorId = useId();

  const [email, setEmail] = useState("");
  const [companyOrUniversity, setCompanyOrUniversity] = useState("");
  const [website, setWebsite] = useState("");
  const [state, setState] = useState<FormState>("idle");
  const [error, setError] = useState<WaitlistApiError | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  const [submittedEmail, setSubmittedEmail] = useState("");

  const activeError: WaitlistApiError | null = clientError
    ? { message: clientError, field: "email" }
    : error;

  function resetForm() {
    setEmail("");
    setCompanyOrUniversity("");
    setError(null);
    setClientError(null);
    setState("idle");
  }

  async function onSubmit(event: { preventDefault(): void }) {
    event.preventDefault();
    if (state === "submitting") return;

    if (!isValidEmail(email.trim())) {
      setError(null);
      setClientError("Alamat emailnya belum valid. Cek lagi, ya.");
      return;
    }

    setState("submitting");
    setError(null);
    setClientError(null);

    try {
      await submitWaitlist({ email, companyOrUniversity, website });
      setSubmittedEmail(email);
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
      <m.div
        className="space-y-5 text-center"
        initial={reduce ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: EASE_OUT }}
      >
        <div className="flex justify-center">
          <DrawnMark tone="success" />
        </div>
        <div className="space-y-2">
          <p className="font-heading text-xl font-medium leading-snug text-foreground">
            Cek email kamu untuk mengonfirmasi pendaftaran.
          </p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Tautan konfirmasi kami kirim ke{" "}
            <span className="font-medium text-foreground">{submittedEmail}</span>.
            Kalau belum kelihatan dalam beberapa menit, coba lihat folder spam.
          </p>
        </div>
        <div className="flex flex-col items-center gap-2 pt-1 sm:flex-row sm:justify-center">
          <Button asChild variant="outline" className="w-full rounded-full sm:w-auto">
            <a href="/">Kembali ke beranda</a>
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="w-full rounded-full sm:w-auto"
            onClick={resetForm}
          >
            Daftarkan email lain
          </Button>
        </div>
      </m.div>
    );
  }

  const emailInvalid = Boolean(activeError) && activeError?.field === "email";
  const companyInvalid = activeError?.field === "companyOrUniversity";

  return (
    <form onSubmit={onSubmit} className="relative space-y-5" noValidate>
      <Field
        id={emailId}
        label="Email"
        name="email"
        type="email"
        inputMode="email"
        autoComplete="email"
        required
        value={email}
        onChange={(e) => {
          setEmail(e.target.value);
          if (clientError) setClientError(null);
        }}
        onBlur={(e) => {
          const value = e.target.value.trim();
          setEmail(value);
          if (value.length > 0 && !isValidEmail(value)) {
            setClientError("Alamat emailnya belum valid. Cek lagi, ya.");
          }
        }}
        invalid={emailInvalid}
        describedBy={activeError ? errorId : undefined}
        placeholder="nama@kampus.ac.id"
        disabled={state === "submitting"}
      />

      <Field
        id={companyId}
        label="Perusahaan atau universitas"
        hint="(opsional)"
        name="companyOrUniversity"
        type="text"
        autoComplete="organization"
        value={companyOrUniversity}
        onChange={(e) => setCompanyOrUniversity(e.target.value)}
        onBlur={(e) => setCompanyOrUniversity(e.target.value.trim())}
        invalid={companyInvalid}
        describedBy={activeError ? errorId : undefined}
        placeholder="Mis. Universitas Indonesia"
        disabled={state === "submitting"}
      />

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

      <AnimatePresence initial={false}>
        {activeError ? (
          <m.p
            key={activeError.message}
            id={errorId}
            role="alert"
            className="flex items-start gap-2 rounded-xl border-2 border-destructive/35 bg-destructive/8 px-3.5 py-2.5 text-sm leading-snug text-destructive"
            initial={reduce ? false : { opacity: 0, y: -6 }}
            animate={
              reduce
                ? { opacity: 1 }
                : { opacity: 1, y: 0, x: [0, -5, 5, -3, 3, 0] }
            }
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6 }}
            transition={{ duration: 0.32, ease: EASE_OUT }}
          >
            {activeError.message}
          </m.p>
        ) : null}
      </AnimatePresence>

      <MagneticButton className="block w-full sm:w-auto" radius={130} strength={0.3}>
        <Button
          type="submit"
          size="lg"
          disabled={state === "submitting"}
          className="w-full rounded-full sm:w-auto"
        >
          {state === "submitting" ? (
            <>
              <Spinner />
              Mengirim…
            </>
          ) : (
            <>
              Gabung waitlist
              <ArrowUpRightIcon
                size={18}
                aria-hidden
                className="transition-transform duration-200 group-hover/button:-translate-y-0.5 group-hover/button:translate-x-0.5"
              />
            </>
          )}
        </Button>
      </MagneticButton>
    </form>
  );
}
