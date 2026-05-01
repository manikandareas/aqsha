import { Card } from "@aqsha/ui/components/card";
import { MotionItem, MotionSection } from "@/components/motion-reveal";

interface FeatureCardProps {
  title: string;
  description: string;
  previewContent: React.ReactNode;
}

const FeatureCard = ({ title, description, previewContent }: FeatureCardProps) => {
  return (
    <MotionItem kind="feature" className="h-full">
      <Card className="h-full bg-card border-border overflow-hidden hover:shadow-lg transition-all duration-300 group rounded-xl">
        <div className="p-8 pb-6">
          <h3 className="text-2xl font-bold text-foreground mb-3">{title}</h3>
          <p className="text-muted-foreground leading-relaxed text-base">
            {description}{" "}
            <a href="#demo" className="text-accent hover:text-accent/80 transition-colors font-medium underline">
              See live demo
            </a>
          </p>
        </div>
        <div className="px-8 pb-8">
          <div className="motion-feature-preview bg-background rounded-lg border border-border overflow-hidden">
            {previewContent}
          </div>
        </div>
      </Card>
    </MotionItem>
  );
};

export const Features = () => {
  return (
    <MotionSection id="features" kind="grid" className="py-12 md:py-20 lg:py-24 px-4 bg-background">
      <div className="container mx-auto max-w-7xl">
        <div className="text-center mb-8 md:mb-12 lg:mb-16">
          <div className="inline-block mb-3 md:mb-4">
            <span className="text-primary text-xs md:text-sm font-semibold tracking-wider uppercase">
              FEATURES
            </span>
          </div>
          <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-foreground mb-3 md:mb-4 px-4">
            Platform Assessment yang Bikin Ngajar Lebih Efektif
          </h2>
          <p className="text-base md:text-lg text-muted-foreground max-w-2xl mx-auto px-4">
            Semua yang kamu butuhkan untuk bikin, share, dan analisa quiz—dalam satu tempat.
          </p>
        </div>

        <div className="grid sm:grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
          <FeatureCard
            title="Generate Soal dengan AI"
            description="Upload PDF, URL, atau teks—AI bikin soal berkualitas dalam hitungan menit. Powered by RAG technology untuk soal yang relevan dengan konteks."
            previewContent={
              <div className="p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <div className="h-5 w-5 bg-primary/50 rounded" />
                  </div>
                  <div className="flex-1">
                    <div className="h-3 bg-muted rounded w-32 mb-2" />
                    <div className="h-2 bg-muted/50 rounded w-24" />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="h-2 bg-muted rounded w-full" />
                  <div className="h-2 bg-muted rounded w-5/6" />
                  <div className="h-2 bg-muted rounded w-4/6" />
                </div>
                <div className="grid grid-cols-2 gap-2 pt-2">
                  <div className="h-8 bg-muted/30 rounded border border-border" />
                  <div className="h-8 bg-muted/30 rounded border border-border" />
                  <div className="h-8 bg-muted/30 rounded border border-border" />
                  <div className="h-8 bg-muted/30 rounded border border-border" />
                </div>
              </div>
            }
          />

          <FeatureCard
            title="Pantau Siswa Real-time"
            description="Lihat siapa yang sedang mengerjakan, siapa yang kesulitan, dan progress setiap siswa—semuanya update otomatis tanpa refresh."
            previewContent={
              <div className="p-6 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="h-4 bg-muted rounded w-32" />
                  <div className="h-6 w-16 bg-primary/20 rounded-full" />
                </div>
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-3 p-3 bg-muted/20 rounded-lg border border-border">
                    <div className="h-10 w-10 rounded-full bg-primary/30" />
                    <div className="flex-1">
                      <div className="h-3 bg-muted rounded w-28 mb-2" />
                      <div className="h-2 bg-muted/50 rounded w-40" />
                    </div>
                    <div className="h-6 w-12 bg-accent/20 rounded" />
                  </div>
                ))}
              </div>
            }
          />

          <FeatureCard
            title="Feedback yang Membangun"
            description="Penjelasan personal setelah submit. Bantu siswa paham kenapa salah dan cara memperbaikinya."
            previewContent={
              <div className="p-6 space-y-4">
                <div className="space-y-2">
                  <div className="h-3 bg-muted rounded w-full" />
                  <div className="h-3 bg-muted rounded w-5/6" />
                </div>
                <div className="bg-accent/10 border border-accent/30 rounded-lg p-4">
                  <div className="h-3 bg-accent/30 rounded w-24 mb-3" />
                  <div className="space-y-2">
                    <div className="h-2 bg-accent/20 rounded w-full" />
                    <div className="h-2 bg-accent/20 rounded w-4/5" />
                    <div className="h-2 bg-accent/20 rounded w-5/6" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <div className="h-8 flex-1 bg-muted/30 rounded border border-border" />
                  <div className="h-8 flex-1 bg-primary/20 rounded border border-primary/30" />
                </div>
              </div>
            }
          />

          <FeatureCard
            title="Analytics Mendalam"
            description="Score distribution, completion trends, dan insights untuk improve cara ngajar."
            previewContent={
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-muted/20 rounded-lg p-3 border border-border">
                    <div className="h-2 bg-muted rounded w-12 mb-2" />
                    <div className="h-4 bg-primary/30 rounded w-16" />
                  </div>
                  <div className="bg-muted/20 rounded-lg p-3 border border-border">
                    <div className="h-2 bg-muted rounded w-12 mb-2" />
                    <div className="h-4 bg-accent/30 rounded w-16" />
                  </div>
                  <div className="bg-muted/20 rounded-lg p-3 border border-border">
                    <div className="h-2 bg-muted rounded w-12 mb-2" />
                    <div className="h-4 bg-chart-3 rounded w-16" />
                  </div>
                </div>
                <div className="flex items-end gap-1 h-32">
                  {[40, 60, 45, 80, 65, 90, 70, 50].map((height, i) => (
                    <div key={i} className="flex-1 bg-primary/30 rounded-t" style={{ height: `${height}%` }} />
                  ))}
                </div>
              </div>
            }
          />
        </div>
      </div>
    </MotionSection>
  );
};
