import { Button } from "@aqsha/ui/components/button";
import { ArrowRight, Check } from "@aqsha/ui/icons";
import { signInUrl } from "@/lib/urls";
import { MotionItem, MotionSection } from "@/components/motion-reveal";

const plans = [
  {
    name: "Free",
    price: "Rp0",
    annual: "Rp0",
    description: "Coba Aqsha, chat ringan, dan sedikit cited answer.",
    credits: "50 credits/bulan",
    cta: "Mulai gratis",
    href: signInUrl,
    features: ["Normal chat", "Cited answer terbatas", "Deep Lite trial terbatas"],
  },
  {
    name: "Starter",
    price: "Rp69rb",
    annual: "Rp690rb/tahun",
    description: "Untuk mahasiswa aktif yang rutin riset tugas dan kuliah.",
    credits: "500 credits/bulan",
    cta: "Pilih Starter",
    href: `${signInUrl}?plan=starter`,
    highlighted: true,
    features: [
      "Normal chat dan cited answer",
      "Beberapa Deep Research kecil",
      "Provider cost guard sekitar $1.25/bulan",
    ],
  },
  {
    name: "Plus",
    price: "Rp149rb",
    annual: "Tahunan belum tersedia",
    description: "Untuk skripsi, paper, dan riset intensif.",
    credits: "1.500 credits/bulan",
    cta: "Pilih Plus",
    href: `${signInUrl}?plan=plus`,
    features: [
      "Deep Research lebih longgar",
      "Source reading lebih banyak",
      "Provider cost guard sekitar $4/bulan",
    ],
  },
];

export const Pricing = () => {
  return (
    <MotionSection id="pricing" kind="pricing" className="bg-background px-4 py-24">
      <div className="container mx-auto max-w-6xl">
        <div className="mb-14 text-center">
          <span className="text-sm font-semibold uppercase tracking-wider text-primary">
            Pricing
          </span>
          <h2 className="mt-4 text-4xl font-bold text-foreground md:text-5xl">
            Paket murah untuk riset mahasiswa
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
            Annual = 10 bulan bayar. Credits tetap reset setiap bulan.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {plans.map((plan) => (
            <MotionItem
              key={plan.name}
              kind="pricing-card"
              className={`flex min-h-[440px] flex-col rounded-xl border p-7 ${
                plan.highlighted
                  ? "border-primary bg-card shadow-[0_20px_60px_rgba(74,144,247,0.14)]"
                  : "border-border/70 bg-card"
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-2xl font-bold text-foreground">{plan.name}</h3>
                  {plan.highlighted ? (
                    <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                      Recommended
                    </span>
                  ) : null}
                </div>
                <p className="mt-3 min-h-[48px] text-sm leading-6 text-muted-foreground">
                  {plan.description}
                </p>
                <div className="mt-6">
                  <span className="text-5xl font-bold text-foreground">{plan.price}</span>
                  <span className="text-muted-foreground">/bulan</span>
                </div>
                <p className="mt-2 text-sm font-medium text-muted-foreground">
                  {plan.annual}
                </p>
                <p className="mt-4 rounded-lg border border-border/70 bg-background px-3 py-2 text-sm font-semibold text-foreground">
                  {plan.credits}
                </p>
              </div>

              <div className="mt-6 grid gap-3">
                {plan.features.map((feature) => (
                  <div key={feature} className="flex gap-3 text-sm text-foreground">
                    <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                    <span>{feature}</span>
                  </div>
                ))}
              </div>

              <a href={plan.href} className="mt-auto block pt-8">
                <Button className="h-12 w-full text-base font-semibold">
                  {plan.cta}
                  <ArrowRight className="ml-2 size-4" />
                </Button>
              </a>
            </MotionItem>
          ))}
        </div>
      </div>
    </MotionSection>
  );
};
