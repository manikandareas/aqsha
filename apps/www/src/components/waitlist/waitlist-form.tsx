"use client";

import { useId } from "react";

import { Button } from "@/components/ui/button";

export function WaitlistForm() {
  const emailId = useId();
  const companyId = useId();

  return (
    <form
      onSubmit={(event) => event.preventDefault()}
      className="relative space-y-5"
      noValidate
    >
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
          disabled
          className="h-12 w-full rounded-xl border border-border bg-background px-4 text-base text-foreground outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
          placeholder="nama@kampus.ac.id"
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
          disabled
          className="h-12 w-full rounded-xl border border-border bg-background px-4 text-base text-foreground outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
          placeholder="Mis. Universitas Indonesia"
        />
      </div>

      <Button
        type="submit"
        disabled
        className="h-12 w-full rounded-full px-7 text-base font-medium sm:w-auto"
      >
        Gabung waitlist
      </Button>
    </form>
  );
}
