"use client";

import { UserProfile } from "@clerk/nextjs";

// Keamanan = Clerk-managed (password/2FA/email/sesi). `routing="hash"` → tak perlu
// catch-all route. ponytail: embed widget Clerk, jangan re-implement security UI.
export default function Page() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl">Keamanan</h1>
        <p className="text-sm text-muted-foreground">
          Kata sandi, autentikasi dua faktor, email, dan sesi dikelola oleh Clerk.
        </p>
      </div>
      <UserProfile routing="hash" />
    </div>
  );
}
