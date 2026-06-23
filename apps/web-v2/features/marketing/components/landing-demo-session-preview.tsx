import {
  BookOpen,
  CheckCircle2,
  Library,
  MessageSquare,
  Search,
} from "@aqsha/ui/icons";

import { cn } from "@/lib/utils";

const demoSteps = [
  {
    eyebrow: "Langkah 1",
    title: "Mulai dari pertanyaan riset",
    body: "Cari paper soal motivasi intrinsik untuk skripsi — semua disimpan di satu workspace.",
    icon: MessageSquare,
  },
  {
    eyebrow: "Langkah 2",
    title: "Kumpulin sumber & catatan",
    body: "3 jurnal diimport\n2 catatan disimpan\nreferensi siap dipakai",
    icon: BookOpen,
  },
  {
    eyebrow: "Langkah 3",
    title: "Nulis bareng Astra",
    body: "Tiap poin ditandai sumbernya\nklaim tetap punyamu, bukan AI yang ngerjain",
    icon: Library,
  },
  {
    eyebrow: "Langkah 4",
    title: "Cek sebelum submit",
    body: "Kutipan dicek ke paper aslinya\nyang cocok ditandai hijau — siap sidang",
    icon: CheckCircle2,
  },
] as const;

type LandingDemoSessionPreviewProps = {
  className?: string;
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
        <span>skripsi-psikologi</span>
        <span className="flex items-center gap-1.5">
          <Search className="size-3" />
          riset aktif
        </span>
      </div>
      <div
        className={cn(
          "landing-demo-stage overflow-hidden",
          isHero ? "landing-demo-stage--hero min-h-0 flex-1" : "h-[330px]",
        )}
      >
        <div className={cn("landing-demo-track", isHero && "landing-demo-track--hero")}>
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
                <div
                  className={cn(
                    "mt-5 whitespace-pre-wrap rounded-md bg-primary-foreground/10 p-4 text-xs leading-6 text-primary-foreground/90",
                    isHero &&
                      "mt-3 min-h-0 flex-1 overflow-auto p-3 text-[11px] leading-5 sm:mt-4 sm:p-4 sm:text-xs sm:leading-6",
                  )}
                >
                  {step.body}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
