import {
  LogIn,
  DollarSign,
  FileText,
  BookOpen,
  Handshake,
  Scale,
  Shield,
} from "lucide-react";
import { FooterUI } from "@/components/ui/footer";
import { signInUrl } from "@/lib/urls";

export const Footer = () => {
  return (
    <FooterUI
      brand={{
        name: "Aqsha",
        description: "Platform assessment berbasis AI yang membantu pendidik membuat soal, melacak progress siswa, dan memberikan feedback secara real-time.",
      }}
      socialLinks={[
        {
          name: "Twitter",
          href: "#",
        },
        {
          name: "Github",
          href: "#",
        },
        {
          name: "LinkedIn",
          href: "#",
        },
      ]}
      columns={[
        {
          title: "Product",
          links: [
            {
              name: "Log in",
              Icon: LogIn,
              href: signInUrl,
            },
            {
              name: "Pricing",
              Icon: DollarSign,
              href: "#pricing",
            },
            {
              name: "Changelog",
              Icon: FileText,
              href: "#changelog",
            },
            {
              name: "Documentation",
              Icon: BookOpen,
              href: "#",
            },
          ],
        },
        {
          title: "Company",
          links: [
            {
              name: "Affiliate Program",
              Icon: Handshake,
              href: "#",
            },
          ],
        },
        {
          title: "Legal",
          links: [
            {
              name: "Terms of Service",
              Icon: Scale,
              href: "/terms",
            },
            {
              name: "Privacy Policy",
              Icon: Shield,
              href: "/privacy",
            },
          ],
        },
      ]}
      copyright="Aqsha © 2025 - All rights reserved."
    />
  );
};
