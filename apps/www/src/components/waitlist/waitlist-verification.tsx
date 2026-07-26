"use client";

import { m, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { MotionProvider } from "@/components/motion-provider";
import { Button } from "@/components/ui/button";
import { DrawnMark } from "@/components/waitlist/drawn-mark";
import { WAITLIST_PATH } from "@/lib/marketing/cta";
import { EASE_OUT } from "@/lib/motion";
import { verifyWaitlist } from "@/lib/waitlist-api";

type VerifyState = "loading" | "success" | "invalid";

/** Tiga titik yang berdenyut bergiliran selama request verifikasi berjalan. */
function LoadingDots() {
  const reduce = useReducedMotion();

  return (
    <span aria-hidden className="flex items-center gap-1.5">
      {[0, 1, 2].map((index) => (
        <m.span
          key={index}
          className="size-2 rounded-full bg-muted-foreground"
          animate={reduce ? { opacity: 0.6 } : { opacity: [0.25, 1, 0.25] }}
          transition={{
            duration: 1.1,
            repeat: reduce ? 0 : Infinity,
            delay: index * 0.16,
            ease: "easeInOut",
          }}
        />
      ))}
    </span>
  );
}

function StateBody({
  tone,
  title,
  description,
  children,
}: {
  tone: "success" | "error";
  title: string;
  description: string;
  children: ReactNode;
}) {
  const reduce = useReducedMotion();

  return (
    <m.div
      className="space-y-5 text-center"
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE_OUT }}
    >
      <div className="flex justify-center">
        <DrawnMark tone={tone} />
      </div>
      <div className="space-y-2">
        <p className="font-heading text-xl font-medium leading-snug text-foreground">
          {title}
        </p>
        <p className="mx-auto max-w-sm text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>
      <div className="flex flex-col items-center gap-2 pt-1 sm:flex-row sm:justify-center">
        {children}
      </div>
    </m.div>
  );
}

/**
 * WaitlistVerification — langkah kedua alur waitlist. Loading punya denyut
 * sendiri supaya tidak terasa mati, sukses dan gagal ditandai coretan yang
 * menggambar dirinya, dan tautan yang tidak valid selalu menawarkan jalan
 * kembali ke pendaftaran.
 */
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

  return (
    <MotionProvider>
      <div className="mx-auto w-full max-w-md">
        {state === "loading" ? (
          <div
            className="flex flex-col items-center gap-4 py-4 text-center"
            role="status"
          >
            <LoadingDots />
            <p className="text-base leading-relaxed text-muted-foreground">
              Memverifikasi email kamu…
            </p>
          </div>
        ) : state === "success" ? (
          <StateBody
            tone="success"
            title="Email kamu sudah terdaftar di waitlist Aqsha."
            description="Kami kabari lewat email ini begitu akses awal dibuka. Sampai ketemu di sana."
          >
            <Button asChild className="w-full rounded-full sm:w-auto">
              <a href="/">Kembali ke beranda</a>
            </Button>
            <Button asChild variant="ghost" className="w-full rounded-full sm:w-auto">
              <a href="/#fitur-dokumen">Lihat fitur Aqsha</a>
            </Button>
          </StateBody>
        ) : (
          <StateBody
            tone="error"
            title="Tautan verifikasi tidak valid atau sudah kedaluwarsa."
            description="Tautannya berlaku sekali pakai. Daftar ulang sebentar dan kami kirim tautan baru."
          >
            <Button asChild className="w-full rounded-full sm:w-auto">
              <a href={WAITLIST_PATH}>Daftar ulang</a>
            </Button>
            <Button asChild variant="ghost" className="w-full rounded-full sm:w-auto">
              <a href="/">Kembali ke beranda</a>
            </Button>
          </StateBody>
        )}
      </div>
    </MotionProvider>
  );
}
