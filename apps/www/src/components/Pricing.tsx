import { Button } from "@aqsha/ui/components/button";
import { Check, X, ArrowRight } from "lucide-react";
import { signInUrl } from "@/lib/urls";
import { MotionItem, MotionSection } from "@/components/motion-reveal";

export const Pricing = () => {
  const features = [
    { text: "50 Labs gratis dengan unlimited questions", available: true },
    { text: "Generate soal dari PDF & URL", available: true },
    { text: "Monitoring real-time siswa", available: true },
    { text: "Analytics & score distribution", available: true },
    { text: "Auto-save otomatis jawaban", available: true },
    { text: "30 anggota tim (unlimited di beta)", available: true },
    { text: "Data retention 5+ tahun", available: true },
    { text: "Export data ke Excel/CSV", available: false },
  ];

  return (
    <MotionSection id="pricing" kind="pricing" className="py-24 px-4 bg-background">
      <div className="container mx-auto max-w-6xl">
        <div className="text-center mb-16">
          <div className="inline-block mb-4">
            <span className="text-primary text-sm font-semibold tracking-wider uppercase">
              PRICING
            </span>
          </div>
          <h2 className="text-4xl md:text-5xl font-bold text-foreground mb-4">
            Harga yang Sesuai dengan Kebutuhan Anda
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Coba semua fitur premium tanpa bayar selama periode beta.
          </p>
        </div>

        <div className="max-w-md mx-auto">
          <MotionItem kind="pricing-card" className="bg-card border border-border/50 rounded-2xl p-8 md:p-10">
            {/* Plan Label */}
            <div className="mb-6">
              <span className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                BETA GRATIS
              </span>
            </div>

            {/* Price */}
            <div className="mb-8">
              <div className="flex items-baseline gap-2">
                <span className="text-6xl md:text-7xl font-bold text-foreground">Rp 0</span>
                <span className="text-xl text-muted-foreground">/selama beta</span>
              </div>
            </div>

            {/* Features List */}
            <div className="space-y-4 mb-8">
              {features.map((feature, index) => (
                <MotionItem
                  key={index}
                  kind="price-feature"
                  className="flex items-start gap-3"
                >
                  <div className="mt-0.5 shrink-0">
                    {feature.available ? (
                      <Check className="h-5 w-5 text-green-500" />
                    ) : (
                      <X className="h-5 w-5 text-muted-foreground/40" />
                    )}
                  </div>
                  <span className={`text-base ${feature.available ? 'text-foreground' : 'text-muted-foreground/60'}`}>
                    {feature.text}
                  </span>
                </MotionItem>
              ))}
            </div>

            {/* CTA Button */}
            <a href={signInUrl} className="block">
              <Button
                className="w-full h-14 text-base font-semibold bg-[hsl(16,90%,60%)] hover:bg-[hsl(16,90%,55%)] text-white"
              >
                Daftar Gratis Sekarang
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </a>

            {/* Small Print */}
            <p className="text-center text-sm text-muted-foreground mt-4">
              Rp 0 hari ini. Tanpa kartu kredit.
            </p>
          </MotionItem>
        </div>

        {/* Bottom Note */}
        <div className="mt-12 text-center">
          <p className="text-sm text-muted-foreground max-w-xl mx-auto">
            💡 <strong className="text-foreground">Harga post-beta</strong> akan diumumkan sebelum periode beta berakhir. Early adopters mendapat harga spesial!
          </p>
        </div>
      </div>
    </MotionSection>
  );
};
