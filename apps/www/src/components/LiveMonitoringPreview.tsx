import { Safari } from "@/components/ui/safari";
import { HandwrittenArrow } from "@/components/ui/handwritten-arrow";
import { appUrl } from "@/lib/urls";
import { MotionSection } from "@/components/motion-reveal";

export const LiveMonitoringPreview = () => {
  const demoUrl = `${appUrl}/demo/activity`;
  const fallbackImageUrl =
    "https://ngertiin-zone.b-cdn.net/landing/Demo%20Lab%20Ngerti.in-Cover.jpg";

  return (
    <MotionSection kind="preview" className="pt-2 pb-12 md:pt-4 md:pb-20 lg:pt-6 lg:pb-24 px-4 bg-background">
      <div className="container mx-auto max-w-7xl">
        {/* Interactive Demo Label */}
        <div className="motion-demo-label flex items-center gap-2 mb-6 ml-4 md:ml-8">  
          <h3 className="text-xs  font-handwriting text-muted-foreground">
            Interactive demo
          </h3>
          <HandwrittenArrow 
            opacity={0.7}
            className="fill-muted-foreground rotate-20"
          />
        </div>
        
        {/* Safari Browser Frame */}
        <div className="motion-preview relative max-w-6xl mx-auto">
          <div className="hidden lg:block">
            <a
              href={demoUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="block"
            >
              <Safari
                url={demoUrl}
                imageSrc={fallbackImageUrl}
                width={1203}
                height={753}
                mode="default"
                className="w-full h-auto"
              />
            </a>
          </div>

          <div className="lg:hidden">
            <a
              href={fallbackImageUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="block"
            >
              <img
                src={fallbackImageUrl}
                alt="Live Monitoring Preview"
                className="w-full h-auto rounded-2xl shadow-md"
                loading="lazy"
              />
            </a>
          </div>
        </div>
      </div>
    </MotionSection>
  );
};
