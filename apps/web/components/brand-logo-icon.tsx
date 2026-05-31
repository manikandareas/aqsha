import Image from "next/image";

import { cn } from "@/lib/utils";

export function BrandLogoIcon({ className }: { className?: string }) {
  return (
    <Image
      src="/logo.svg"
      alt="Aqsha"
      width={1254}
      height={1254}
      className={cn("size-7 shrink-0 object-contain", className)}
      priority
    />
  );
}
