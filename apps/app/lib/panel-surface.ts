import { cn } from "@/lib/utils";

const panelSurfaceFramedClass =
  "flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-border/70 bg-background shadow-sm";

const panelSurfaceFullBleedClass =
  "flex min-h-0 min-w-0 flex-col overflow-hidden rounded-none border-0 bg-background shadow-none";

export function panelSurfaceClass({ framed = true }: { framed?: boolean } = {}) {
  return framed ? panelSurfaceFramedClass : panelSurfaceFullBleedClass;
}

export const panelHeaderPaddingClass = "px-5 py-5 sm:px-6 sm:py-6";
export const panelBodyPaddingClass = "px-5 pb-8 pt-3 sm:px-6";
export const panelComposerPaddingClass = "border-t border-border/60 px-4 pb-4 pt-2.5 sm:px-5";

export function detailSplitMainSurfaceClass(framed: boolean) {
  return cn(
    "flex min-h-0 min-w-0 flex-col overflow-hidden bg-background transition-all duration-300 ease-out",
    panelSurfaceClass({ framed }),
  );
}
