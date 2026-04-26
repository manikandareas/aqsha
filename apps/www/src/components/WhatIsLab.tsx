import { HeroVideoDialog } from "./ui/hero-video-dialog";
import { MotionSection, MotionItem } from "@/components/motion-reveal";

export const WhatIsLab = () => {
  return (
    <MotionSection kind="video" className="py-16 md:py-24 px-4 bg-background">
      <div className="container mx-auto max-w-6xl">
        <div className="text-center mb-8 md:mb-12">
          <div className="inline-block mb-3 md:mb-4">
            <span className="text-primary text-xs md:text-sm font-semibold tracking-wider uppercase">
              TENTANG LAB
            </span>
          </div>
          <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold text-foreground mb-3 md:mb-4">
            Apa itu Lab?
          </h2>
          <p className="text-sm md:text-base lg:text-lg text-muted-foreground max-w-2xl mx-auto">
            Lab adalah pusat kendali soal-soalmu. Kelola dengan mudah, buat sesi pengerjaan, dan bagikan ke siapa saja untuk dikerjakan bersama-sama—semua dalam satu tempat!
          </p>
        </div>

        <MotionItem kind="feature" className="w-full max-w-4xl mx-auto">
          <HeroVideoDialog
            animationStyle="from-center"
            videoSrc="https://ngertiin-zone.b-cdn.net/landing/Demo%20Lab%20Ngerti.in.mp4"
            thumbnailSrc="https://ngertiin-zone.b-cdn.net/landing/Demo%20Lab%20Ngerti.in-Cover.jpg"
            thumbnailAlt="Apa itu Lab?"
          />
        </MotionItem>
      </div>
    </MotionSection>
  );
};
