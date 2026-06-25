import { cn } from "@/lib/utils"
import { FlickerSpinner } from "./flicker-spinner"

// Canonical loading spinner. Renders the brand `FlickerSpinner` (a theme-aware
// dot-grid that self-animates and respects reduced-motion): color follows the
// `text-*` className via currentColor, size follows the `size-*` className.
function Spinner({ className }: { className?: string }) {
  return <FlickerSpinner className={cn("size-4", className)} />
}

export { Spinner }
