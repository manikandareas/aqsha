import { Button } from "@/components/ui/button";
import { ModeToggle } from "@/components/ModeToggle";
import { LogoWithText } from "./ui/logo";
import { signInUrl } from "@/lib/urls";

export const Header = () => {
  return (
    <header className="bg-background">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <a href="/" className="flex items-center gap-2">
       <LogoWithText/>
        </a>

        <nav className="hidden md:flex items-center gap-8">
          <a href="#features" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Features
          </a>
          <a href="#pricing" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Pricing
          </a>
          <a href="#faq" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            FAQ
          </a>
          <a href="#testimonials" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Testimonials
          </a>
        </nav>

        <div className="flex items-center gap-2">
          <a href={signInUrl}>
            <Button 
              size="sm" 
              className="hidden sm:inline-flex"
            >
              Masuk
            </Button>
          </a>
          <ModeToggle />
        </div>
      </div>
    </header>
  );
};
