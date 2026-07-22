import { BookOpenIcon, FileTextIcon, GlobeIcon } from "@aqsha/ui/icons";

export {
  dedupeCards,
  faviconUrl,
  researchSourceToCard,
  sourceDomain,
  sourceHref,
  toCards,
} from "@aqsha/chat-core/timeline";

export function originMeta(origin: string): {
  Icon: typeof GlobeIcon;
  label: string;
} {
  switch (origin) {
    case "arxiv":
      return { Icon: FileTextIcon, label: "arXiv" };
    case "doi":
      return { Icon: BookOpenIcon, label: "Makalah" };
    default:
      return { Icon: GlobeIcon, label: "Web" };
  }
}
