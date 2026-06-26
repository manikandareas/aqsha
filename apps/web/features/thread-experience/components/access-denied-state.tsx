"use client";

import { panelBodyPaddingClass } from "@/lib/panel-surface";
import { cn } from "@/lib/utils";

export function AccessDeniedState() {
  return (
    <div
      className={cn(
        "mx-auto grid w-full max-w-xl flex-1 place-items-center py-10 text-center",
        panelBodyPaddingClass,
      )}
    >
      <div className="grid gap-3">
        <h1 className="font-heading text-3xl font-bold leading-tight">Akses ditolak</h1>
        <p className="text-[14px] text-muted-foreground">
          Thread ini tidak tersedia atau bukan milik akun kamu.
        </p>
      </div>
    </div>
  );
}
