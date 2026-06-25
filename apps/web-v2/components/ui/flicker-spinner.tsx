import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

// Brand loading spinner: a 7×7 LED-style dot grid that flickers a travelling
// pattern. Theme-aware — the lit dots use `currentColor` (so it inherits the
// parent's `text-*` color and works in light + dark), the resting grid is the
// same color dimmed. Size comes from `className` (e.g. `size-7`) or the `size`
// prop. Respects `prefers-reduced-motion` (the dots hold static). Replaces the
// Hugeicons `Loader2Icon` spinner for the canonical `Spinner` + prominent loaders.
export function FlickerSpinner({
  className,
  size,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 42 42"
      xmlns="http://www.w3.org/2000/svg"
      role="status"
      aria-label="Memuat"
      className={cn("flicker-spinner text-muted-foreground", className)}
      style={{ "--dur": "2.400s" } as CSSProperties}
    >
      <style>{`
        .flicker-spinner circle { fill: currentColor; }
        .flicker-spinner circle:not(.on) { opacity: 0.16; }
        @media (prefers-reduced-motion: reduce) { .flicker-spinner circle.on { animation: none !important; } }
        @keyframes f1110000000000000 { 0% { opacity: 1; } 18.74% { opacity: 1; } 18.75% { opacity: 0; } 100% { opacity: 0; } }
        @keyframes f0111000000000000 { 0% { opacity: 0; } 6.24% { opacity: 0; } 6.25% { opacity: 1; } 24.99% { opacity: 1; } 25.00% { opacity: 0; } 100% { opacity: 0; } }
        @keyframes f0001100000000000 { 0% { opacity: 0; } 18.74% { opacity: 0; } 18.75% { opacity: 1; } 31.24% { opacity: 1; } 31.25% { opacity: 0; } 100% { opacity: 0; } }
        @keyframes f1000000000000001 { 0% { opacity: 1; } 6.24% { opacity: 1; } 6.25% { opacity: 0; } 93.74% { opacity: 0; } 93.75% { opacity: 1; } 100% { opacity: 1; } }
        @keyframes f0110000000000001 { 0% { opacity: 0; } 6.24% { opacity: 0; } 6.25% { opacity: 1; } 18.74% { opacity: 1; } 18.75% { opacity: 0; } 93.74% { opacity: 0; } 93.75% { opacity: 1; } 100% { opacity: 1; } }
        @keyframes f1111100000000000 { 0% { opacity: 1; } 31.24% { opacity: 1; } 31.25% { opacity: 0; } 100% { opacity: 0; } }
        @keyframes f0001011000000000 { 0% { opacity: 0; } 18.74% { opacity: 0; } 18.75% { opacity: 1; } 24.99% { opacity: 1; } 25.00% { opacity: 0; } 31.24% { opacity: 0; } 31.25% { opacity: 1; } 43.74% { opacity: 1; } 43.75% { opacity: 0; } 100% { opacity: 0; } }
        @keyframes f0000111000000000 { 0% { opacity: 0; } 24.99% { opacity: 0; } 25.00% { opacity: 1; } 43.74% { opacity: 1; } 43.75% { opacity: 0; } 100% { opacity: 0; } }
        @keyframes f0000000000000111 { 0% { opacity: 0; } 81.24% { opacity: 0; } 81.25% { opacity: 1; } 100% { opacity: 1; } }
        @keyframes f1000000000001111 { 0% { opacity: 1; } 6.24% { opacity: 1; } 6.25% { opacity: 0; } 74.99% { opacity: 0; } 75.00% { opacity: 1; } 100% { opacity: 1; } }
        @keyframes f0000111110000000 { 0% { opacity: 0; } 24.99% { opacity: 0; } 25.00% { opacity: 1; } 56.24% { opacity: 1; } 56.25% { opacity: 0; } 100% { opacity: 0; } }
        @keyframes f0000011100000000 { 0% { opacity: 0; } 31.24% { opacity: 0; } 31.25% { opacity: 1; } 49.99% { opacity: 1; } 50.00% { opacity: 0; } 100% { opacity: 0; } }
        @keyframes f0000000000001110 { 0% { opacity: 0; } 74.99% { opacity: 0; } 75.00% { opacity: 1; } 93.74% { opacity: 1; } 93.75% { opacity: 0; } 100% { opacity: 0; } }
        @keyframes f0000000000010110 { 0% { opacity: 0; } 68.74% { opacity: 0; } 68.75% { opacity: 1; } 74.99% { opacity: 1; } 75.00% { opacity: 0; } 81.24% { opacity: 0; } 81.25% { opacity: 1; } 93.74% { opacity: 1; } 93.75% { opacity: 0; } 100% { opacity: 0; } }
        @keyframes f0000000011111000 { 0% { opacity: 0; } 49.99% { opacity: 0; } 50.00% { opacity: 1; } 81.24% { opacity: 1; } 81.25% { opacity: 0; } 100% { opacity: 0; } }
        @keyframes f0000000101100000 { 0% { opacity: 0; } 43.74% { opacity: 0; } 43.75% { opacity: 1; } 49.99% { opacity: 1; } 50.00% { opacity: 0; } 56.24% { opacity: 0; } 56.25% { opacity: 1; } 68.74% { opacity: 1; } 68.75% { opacity: 0; } 100% { opacity: 0; } }
        @keyframes f0000000110000000 { 0% { opacity: 0; } 43.74% { opacity: 0; } 43.75% { opacity: 1; } 56.24% { opacity: 1; } 56.25% { opacity: 0; } 100% { opacity: 0; } }
        @keyframes f0000000000011000 { 0% { opacity: 0; } 68.74% { opacity: 0; } 68.75% { opacity: 1; } 81.24% { opacity: 1; } 81.25% { opacity: 0; } 100% { opacity: 0; } }
        @keyframes f0000000001110000 { 0% { opacity: 0; } 56.24% { opacity: 0; } 56.25% { opacity: 1; } 74.99% { opacity: 1; } 75.00% { opacity: 0; } 100% { opacity: 0; } }
        @keyframes f0000000011100000 { 0% { opacity: 0; } 49.99% { opacity: 0; } 50.00% { opacity: 1; } 68.74% { opacity: 1; } 68.75% { opacity: 0; } 100% { opacity: 0; } }
      `}</style>
      <circle cx="3" cy="3" r="2" />
      <circle cx="9" cy="3" r="2" />
      <circle cx="15" cy="3" r="2" />
      <circle cx="21" cy="3" r="2" />
      <circle cx="27" cy="3" r="2" />
      <circle cx="33" cy="3" r="2" />
      <circle cx="39" cy="3" r="2" />
      <circle cx="3" cy="9" r="2" />
      <circle cx="9" cy="9" r="2" />
      <circle cx="15" cy="9" r="2" />
      <circle className="on" cx="15" cy="9" r="2" opacity={1} style={{ animation: "f1110000000000000 var(--dur) linear infinite" }} />
      <circle cx="21" cy="9" r="2" />
      <circle className="on" cx="21" cy="9" r="2" opacity={0} style={{ animation: "f0111000000000000 var(--dur) linear infinite" }} />
      <circle cx="27" cy="9" r="2" />
      <circle className="on" cx="27" cy="9" r="2" opacity={0} style={{ animation: "f0001100000000000 var(--dur) linear infinite" }} />
      <circle cx="33" cy="9" r="2" />
      <circle cx="39" cy="9" r="2" />
      <circle cx="3" cy="15" r="2" />
      <circle cx="9" cy="15" r="2" />
      <circle className="on" cx="9" cy="15" r="2" opacity={1} style={{ animation: "f1000000000000001 var(--dur) linear infinite" }} />
      <circle cx="15" cy="15" r="2" />
      <circle className="on" cx="15" cy="15" r="2" opacity={0} style={{ animation: "f0110000000000001 var(--dur) linear infinite" }} />
      <circle cx="21" cy="15" r="2" />
      <circle className="on" cx="21" cy="15" r="2" opacity={1} style={{ animation: "f1111100000000000 var(--dur) linear infinite" }} />
      <circle cx="27" cy="15" r="2" />
      <circle className="on" cx="27" cy="15" r="2" opacity={0} style={{ animation: "f0001011000000000 var(--dur) linear infinite" }} />
      <circle cx="33" cy="15" r="2" />
      <circle className="on" cx="33" cy="15" r="2" opacity={0} style={{ animation: "f0000111000000000 var(--dur) linear infinite" }} />
      <circle cx="39" cy="15" r="2" />
      <circle cx="3" cy="21" r="2" />
      <circle cx="9" cy="21" r="2" />
      <circle className="on" cx="9" cy="21" r="2" opacity={0} style={{ animation: "f0000000000000111 var(--dur) linear infinite" }} />
      <circle cx="15" cy="21" r="2" />
      <circle className="on" cx="15" cy="21" r="2" opacity={1} style={{ animation: "f1000000000001111 var(--dur) linear infinite" }} />
      <circle cx="21" cy="21" r="2" />
      <circle cx="27" cy="21" r="2" />
      <circle className="on" cx="27" cy="21" r="2" opacity={0} style={{ animation: "f0000111110000000 var(--dur) linear infinite" }} />
      <circle cx="33" cy="21" r="2" />
      <circle className="on" cx="33" cy="21" r="2" opacity={0} style={{ animation: "f0000011100000000 var(--dur) linear infinite" }} />
      <circle cx="39" cy="21" r="2" />
      <circle cx="3" cy="27" r="2" />
      <circle cx="9" cy="27" r="2" />
      <circle className="on" cx="9" cy="27" r="2" opacity={0} style={{ animation: "f0000000000001110 var(--dur) linear infinite" }} />
      <circle cx="15" cy="27" r="2" />
      <circle className="on" cx="15" cy="27" r="2" opacity={0} style={{ animation: "f0000000000010110 var(--dur) linear infinite" }} />
      <circle cx="21" cy="27" r="2" />
      <circle className="on" cx="21" cy="27" r="2" opacity={0} style={{ animation: "f0000000011111000 var(--dur) linear infinite" }} />
      <circle cx="27" cy="27" r="2" />
      <circle className="on" cx="27" cy="27" r="2" opacity={0} style={{ animation: "f0000000101100000 var(--dur) linear infinite" }} />
      <circle cx="33" cy="27" r="2" />
      <circle className="on" cx="33" cy="27" r="2" opacity={0} style={{ animation: "f0000000110000000 var(--dur) linear infinite" }} />
      <circle cx="39" cy="27" r="2" />
      <circle cx="3" cy="33" r="2" />
      <circle cx="9" cy="33" r="2" />
      <circle cx="15" cy="33" r="2" />
      <circle className="on" cx="15" cy="33" r="2" opacity={0} style={{ animation: "f0000000000011000 var(--dur) linear infinite" }} />
      <circle cx="21" cy="33" r="2" />
      <circle className="on" cx="21" cy="33" r="2" opacity={0} style={{ animation: "f0000000001110000 var(--dur) linear infinite" }} />
      <circle cx="27" cy="33" r="2" />
      <circle className="on" cx="27" cy="33" r="2" opacity={0} style={{ animation: "f0000000011100000 var(--dur) linear infinite" }} />
      <circle cx="33" cy="33" r="2" />
      <circle cx="39" cy="33" r="2" />
      <circle cx="3" cy="39" r="2" />
      <circle cx="9" cy="39" r="2" />
      <circle cx="15" cy="39" r="2" />
      <circle cx="21" cy="39" r="2" />
      <circle cx="27" cy="39" r="2" />
      <circle cx="33" cy="39" r="2" />
      <circle cx="39" cy="39" r="2" />
    </svg>
  );
}
