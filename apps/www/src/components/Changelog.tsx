import { Button } from "@/components/ui/button";
import { Play } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { MotionSection } from "@/components/motion-reveal";

export const Changelog = () => {
  return (
    <MotionSection kind="compact" className="py-8 px-4 bg-background">
      <div className="container mx-auto max-w-2xl text-center space-y-2">
        <Badge variant="outline" className="border-orange-500/50 text-orange-500 text-[10px] px-2 py-0.5">
          Oct 8, 2025 • Last release
        </Badge>

        <h2 className="text-lg md:text-xl font-bold text-foreground">
          Color schemes & cross-domain tracking 🎨
        </h2>

        <p className="text-muted-foreground text-xs leading-relaxed max-w-lg mx-auto">
          Change your dashboard colors, track visitors across domains,
          and 2 security features.
        </p>

        <div className="pt-1">
          <Button variant="outline" size="sm" className="gap-1.5 h-7 text-xs px-3">
            <Play className="h-2.5 w-2.5 fill-current" />
            Watch Video
          </Button>
        </div>

        <div className="pt-1">
          <a
            href="#"
            className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
          >
            All changelogs
          </a>
        </div>
      </div>
    </MotionSection>
  );
};
