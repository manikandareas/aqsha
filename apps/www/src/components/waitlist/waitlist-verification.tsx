"use client";

import { useEffect, useRef, useState } from "react";

import { verifyWaitlist } from "@/lib/waitlist-api";

type VerifyState = "loading" | "success" | "invalid";

export function WaitlistVerification() {
  const [state, setState] = useState<VerifyState>("loading");
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const token = new URLSearchParams(window.location.search).get("token")?.trim() ?? "";
    if (!token) {
      setState("invalid");
      return;
    }

    void verifyWaitlist(token)
      .then(() => setState("success"))
      .catch(() => setState("invalid"));
  }, []);

  if (state === "loading") {
    return (
      <p className="text-base leading-relaxed text-muted-foreground">
        Memverifikasi email kamu…
      </p>
    );
  }

  if (state === "success") {
    return (
      <div className="space-y-6">
        <p className="text-base leading-relaxed text-foreground">
          Email kamu sudah terdaftar di waitlist Aqsha.
        </p>
        <a
          href="/"
          className="inline-flex h-12 items-center justify-center rounded-full bg-primary px-7 text-base font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          Kembali ke beranda
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-base leading-relaxed text-foreground">
        Tautan verifikasi tidak valid atau sudah kedaluwarsa.
      </p>
      <a
        href="/waitlist"
        className="inline-flex h-12 items-center justify-center rounded-full bg-primary px-7 text-base font-medium text-primary-foreground transition-opacity hover:opacity-90"
      >
        Daftar ulang di waitlist
      </a>
    </div>
  );
}
