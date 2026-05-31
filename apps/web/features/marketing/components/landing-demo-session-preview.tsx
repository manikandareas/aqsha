import {
  CheckCircle2,
  Code2,
  Library,
  Search,
  SquareTerminal,
} from "@aqsha/ui/icons";

import { cn } from "@/lib/utils";

const demoSteps = [
  {
    eyebrow: "Question",
    title: "Frame the inquiry",
    body: "How do recent retrieval papers evaluate grounded answers?",
    icon: SquareTerminal,
  },
  {
    eyebrow: "Sources",
    title: "Bring the evidence in",
    body: "3 papers imported\n2 web sources saved\nnotes linked to the thread",
    icon: Code2,
  },
  {
    eyebrow: "Synthesis",
    title: "Write with citations attached",
    body: "Claims mapped to source passages\nopen questions kept for follow-up",
    icon: CheckCircle2,
  },
  {
    eyebrow: "Workspace",
    title: "Save what is worth reusing",
    body: "Answer, papers, and notes saved to: RAG Evaluation",
    icon: Library,
  },
] as const;

type LandingDemoSessionPreviewProps = {
  className?: string;
  /** Fills parent height; use inside a 16:9 frame with fluid step animation */
  variant?: "default" | "hero";
};

export function LandingDemoSessionPreview({
  className,
  variant = "default",
}: LandingDemoSessionPreviewProps) {
  const isHero = variant === "hero";

  return (
    <div
      className={cn(
        "rounded-md bg-foreground p-4 text-primary-foreground",
        isHero && "flex h-full min-h-0 flex-col p-3 sm:p-4",
        className,
      )}
    >
      <div
        className={cn(
          "mb-6 flex items-center justify-between text-xs text-primary-foreground/60",
          isHero && "mb-3 shrink-0 sm:mb-4",
        )}
      >
        <span>workspace-rag</span>
        <span className="flex items-center gap-1.5">
          <Search className="size-3" />
          inquiry active
        </span>
      </div>
      <div
        className={cn(
          "landing-demo-stage overflow-hidden",
          isHero
            ? "landing-demo-stage--hero flex-1 min-h-0"
            : "h-[330px]",
        )}
      >
        <div
          className={cn("landing-demo-track", isHero && "landing-demo-track--hero")}
        >
          {demoSteps.map((step) => {
            const Icon = step.icon;

            return (
              <section
                key={step.title}
                className={cn(
                  "landing-demo-step",
                  isHero && "landing-demo-step--hero flex min-h-0 flex-col",
                )}
              >
                <div
                  className={cn(
                    "mb-5 flex h-10 w-10 items-center justify-center rounded-md bg-primary-foreground/10",
                    isHero && "mb-3 h-8 w-8 sm:mb-4 sm:h-10 sm:w-10",
                  )}
                >
                  <Icon className={cn("h-5 w-5", isHero && "h-4 w-4 sm:h-5 sm:w-5")} />
                </div>
                <p className="text-xs font-medium uppercase tracking-normal text-primary-foreground/50">
                  {step.eyebrow}
                </p>
                <h3
                  className={cn(
                    "mt-3 text-2xl font-semibold tracking-normal text-primary-foreground",
                    isHero &&
                      "mt-2 text-lg leading-snug sm:mt-3 sm:text-xl lg:text-2xl",
                  )}
                >
                  {step.title}
                </h3>
                <pre
                  className={cn(
                    "mt-5 whitespace-pre-wrap rounded-md bg-primary-foreground/10 p-4 font-mono text-xs leading-6 text-primary-foreground/85",
                    isHero && "mt-3 min-h-0 flex-1 overflow-auto p-3 text-[11px] leading-5 sm:mt-4 sm:p-4 sm:text-xs sm:leading-6",
                  )}
                >
                  {step.body}
                </pre>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
