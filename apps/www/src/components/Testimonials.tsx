import { Card } from "@aqsha/ui/components/card";
import { Quote } from "@aqsha/ui/icons";
import { MotionSection } from "@/components/motion-reveal";

interface TestimonialProps {
  name: string;
  role: string;
  content: string;
}

const TestimonialCard = ({ name, role, content }: TestimonialProps) => {
  return (
    <Card className="flex-shrink-0 w-[300px] md:w-[340px] lg:w-[380px] p-4 md:p-6 bg-card border-border hover:border-primary/50 transition-colors duration-200 group snap-start">
      <div className="mb-3 md:mb-4 text-primary/20">
        <Quote className="h-8 w-8 md:h-10 md:w-10" />
      </div>
      <p className="text-foreground text-sm md:text-base mb-4 md:mb-6 leading-relaxed italic">"{content}"</p>
      <div className="flex items-center gap-2 md:gap-3">
        <div className="h-10 w-10 md:h-12 md:w-12 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary text-base md:text-lg flex-shrink-0">
          {name[0]}
        </div>
        <div className="min-w-0">
          <div className="font-semibold text-foreground text-sm md:text-base truncate">{name}</div>
          <div className="text-xs md:text-sm text-muted-foreground truncate">{role}</div>
        </div>
      </div>
    </Card>
  );
};

const MarqueeRow = ({ testimonials, direction }: { testimonials: TestimonialProps[]; direction: "left" | "right" }) => {
  return (
    <div className="relative overflow-hidden py-4 group/row">
      <div
        className={`flex gap-4 ${direction === "left" ? "animate-marquee-left" : "animate-marquee-right"} group-hover/row:[animation-play-state:paused]`}
      >
        {[...testimonials, ...testimonials].map((testimonial, i) => (
          <TestimonialCard key={i} {...testimonial} />
        ))}
      </div>
    </div>
  );
};

export const Testimonials = () => {
  const testimonialsRow1: TestimonialProps[] = [
    {
      name: "Dr. Sari Wijaya",
      role: "Dosen Ilmu Komputer",
      content: "Aqsha bikin PDF jadi kuis dalam hitungan menit. Game changer banget!",
    },
    {
      name: "Prof. Ahmad Rahman",
      role: "Profesor Matematika",
      content: "Monitoring real-time bantu aku improve cara ngajar langsung.",
    },
    {
      name: "Maya Kusuma",
      role: "Admin Akademik",
      content: "Siswa suka banget sama pengalaman yang smooth. Gak ada masalah teknis lagi.",
    },
    {
      name: "Dr. Rini Astuti",
      role: "Pengajar Biologi",
      content: "Dari URL jadi assessment dalam detik. Workflow aku 10x lebih efisien!",
    },
  ];

  const testimonialsRow2: TestimonialProps[] = [
    {
      name: "Budi Santoso",
      role: "Training Manager",
      content: "Dashboard analytics tunjukkin persis dimana siswa kesulitan.",
    },
    {
      name: "Lisa Purnama",
      role: "Educator Online",
      content: "Fitur autosave jadi siswa gak pernah kehilangan progress mereka.",
    },
    {
      name: "Dr. Andi Pratama",
      role: "Kepala Departemen",
      content: "Tools kurasi soal kasih kontrol penuh atas konten pembelajaran.",
    },
    {
      name: "Fitri Handayani",
      role: "Guru SMA",
      content: "Kode akses bikin sharing lab ke siswa jadi super gampang.",
    },
  ];

  return (
    <MotionSection id="testimonials" kind="marquee" className="py-12 md:py-20 lg:py-24 bg-background overflow-hidden">
      <div className="space-y-4">
        <MarqueeRow testimonials={testimonialsRow1} direction="left" />
        <MarqueeRow testimonials={testimonialsRow2} direction="right" />
      </div>
    </MotionSection>
  );
};
