import {
  Add01Icon,
  AlertCircleIcon as HugeAlertCircleIcon,
  ArchiveIcon as HugeArchiveIcon,
  ArrowDown01Icon,
  ArrowLeft01Icon,
  ArrowRight01Icon,
  ArrowReloadHorizontalIcon,
  ArrowUp01Icon,
  ArrowUpToLineIcon as HugeArrowUpToLineIcon,
  ArrowUpRight01Icon,
  ArrangeByLettersAZIcon,
  Attachment01Icon,
  BalanceScaleIcon,
  BookOpen01Icon,
  Bookmark01Icon,
  BracesIcon as HugeBracesIcon,
  Calendar03Icon,
  Camera01Icon,
  Cancel01Icon,
  CancelCircleIcon,
  ChartColumnIcon as HugeChartColumnIcon,
  ChartUpIcon,
  CheckIcon as HugeCheckIcon,
  CheckmarkCircle02Icon,
  ChevronDownIcon as HugeChevronDownIcon,
  ChevronRightIcon as HugeChevronRightIcon,
  ChevronUpIcon as HugeChevronUpIcon,
  ChevronsDownUpIcon,
  CircleIcon as HugeCircleIcon,
  Clock03Icon,
  CompassIcon as HugeCompassIcon,
  ComputerIcon,
  CodeXmlIcon,
  Copy01Icon,
  CornerDownLeftIcon as HugeCornerDownLeftIcon,
  CreditCardIcon as HugeCreditCardIcon,
  Delete02Icon,
  Dollar01Icon,
  Download01Icon,
  ExpandParagraphIcon as HugeExpandParagraphIcon,
  ExternalLinkIcon as HugeExternalLinkIcon,
  EyeIcon as HugeEyeIcon,
  FavouriteIcon,
  File01Icon,
  FileDownloadIcon,
  FileScriptIcon,
  FilterIcon as HugeFilterIcon,
  Flag01Icon,
  FlaskConicalIcon as HugeFlaskConicalIcon,
  Folder01Icon,
  FolderTreeIcon as HugeFolderTreeIcon,
  GaugeIcon as HugeGaugeIcon,
  GitBranchIcon as HugeGitBranchIcon,
  GlobeIcon as HugeGlobeIcon,
  HandshakeIcon as HugeHandshakeIcon,
  HelpCircleIcon as HugeHelpCircleIcon,
  Home01Icon,
  Image01Icon,
  InformationCircleIcon,
  Layers01Icon,
  LayoutGridIcon as HugeLayoutGridIcon,
  LibraryIcon,
  Link01Icon,
  Link02Icon,
  Loading03Icon,
  LockIcon as HugeLockIcon,
  Login01Icon,
  Logout01Icon,
  Maximize01Icon,
  Message01Icon,
  MessageAdd01Icon,
  Mic01Icon,
  Minimize01Icon,
  MinusSignIcon,
  Moon02Icon,
  MoreHorizontalIcon as HugeMoreHorizontalIcon,
  MoreVerticalIcon as HugeMoreVerticalIcon,
  NotebookIcon as HugeNotebookIcon,
  PaintBoardIcon,
  PanelLeftIcon as HugePanelLeftIcon,
  PencilEdit01Icon,
  PenTool01Icon,
  Pin02Icon,
  PinOffIcon as HugePinOffIcon,
  PlayIcon as HugePlayIcon,
  QuoteUpIcon,
  SaveIcon as HugeSaveIcon,
  Search01Icon,
  Settings01Icon,
  Shield01Icon,
  SparklesIcon as HugeSparklesIcon,
  SquareIcon as HugeSquareIcon,
  Sun01Icon,
  TableIcon as HugeTableIcon,
  Telescope01Icon,
  TerminalIcon,
  ThumbsDownIcon as HugeThumbsDownIcon,
  ThumbsUpIcon as HugeThumbsUpIcon,
  Upload01Icon,
  CloudUploadIcon,
  UserIcon,
  UserMultipleIcon,
  Wrench01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { Ref } from "react";

import type { HugeiconsIconProps, IconSvgElement } from "@hugeicons/react";

type IconProps = Omit<HugeiconsIconProps, "icon" | "altIcon" | "strokeWidth"> & {
  strokeWidth?: string | number;
  ref?: Ref<SVGSVGElement>;
};

const createIcon = (icon: IconSvgElement) =>
  function Icon({ ref, strokeWidth, ...props }: IconProps) {
    return (
      <HugeiconsIcon
        ref={ref}
        icon={icon}
        strokeWidth={
          typeof strokeWidth === "string" ? Number(strokeWidth) : strokeWidth
        }
        {...props}
      />
    );
  };

export const AlertCircleIcon = createIcon(HugeAlertCircleIcon);
export const ArchiveIcon = createIcon(HugeArchiveIcon);
export const ArrowDownAZIcon = createIcon(ArrangeByLettersAZIcon);
export const ArrowDownIcon = createIcon(ArrowDown01Icon);
export const ArrowLeftIcon = createIcon(ArrowLeft01Icon);
export const ArrowRight = createIcon(ArrowRight01Icon);
export const ArrowRightIcon = createIcon(ArrowRight01Icon);
export const ArrowUpIcon = createIcon(ArrowUp01Icon);
export const ArrowUpToLineIcon = createIcon(HugeArrowUpToLineIcon);
export const ArrowUpRightIcon = createIcon(ArrowUpRight01Icon);
export const BookOpen = createIcon(BookOpen01Icon);
export const BookOpenIcon = createIcon(BookOpen01Icon);
export const BookmarkIcon = createIcon(Bookmark01Icon);
export const BracesIcon = createIcon(HugeBracesIcon);
export const CalendarRangeIcon = createIcon(Calendar03Icon);
export const CameraIcon = createIcon(Camera01Icon);
export const ChartColumnIcon = createIcon(HugeChartColumnIcon);
export const Check = createIcon(HugeCheckIcon);
export const CheckCircle2 = createIcon(CheckmarkCircle02Icon);
export const CheckIcon = createIcon(HugeCheckIcon);
export const CheckCircle2Icon = createIcon(CheckmarkCircle02Icon);
export const ChevronDown = createIcon(HugeChevronDownIcon);
export const ChevronDownIcon = createIcon(HugeChevronDownIcon);
export const ChevronRight = createIcon(HugeChevronRightIcon);
export const ChevronRightIcon = createIcon(HugeChevronRightIcon);
export const ChevronUpIcon = createIcon(HugeChevronUpIcon);
export const ChevronsUpDownIcon = createIcon(ChevronsDownUpIcon);
export const Circle = createIcon(HugeCircleIcon);
export const CircleIcon = createIcon(HugeCircleIcon);
export const Clock3 = createIcon(Clock03Icon);
export const ClockIcon = createIcon(Clock03Icon);
export const CompassIcon = createIcon(HugeCompassIcon);
export const Code2 = createIcon(CodeXmlIcon);
export const Code2Icon = createIcon(CodeXmlIcon);
export const CopyIcon = createIcon(Copy01Icon);
export const CornerDownLeftIcon = createIcon(HugeCornerDownLeftIcon);
export const CreditCardIcon = createIcon(HugeCreditCardIcon);
export const DollarSign = createIcon(Dollar01Icon);
export const DownloadIcon = createIcon(Download01Icon);
export const ExternalLinkIcon = createIcon(HugeExternalLinkIcon);
export const ExpandParagraphIcon = createIcon(HugeExpandParagraphIcon);
export const EyeIcon = createIcon(HugeEyeIcon);
export const FileDownIcon = createIcon(FileDownloadIcon);
export const FileIcon = createIcon(File01Icon);
export const FileText = createIcon(FileScriptIcon);
export const FileTextIcon = createIcon(FileScriptIcon);
export const FilterIcon = createIcon(HugeFilterIcon);
export const Flag = createIcon(Flag01Icon);
export const FlagIcon = createIcon(Flag01Icon);
export const FlaskConicalIcon = createIcon(HugeFlaskConicalIcon);
export const FolderIcon = createIcon(Folder01Icon);
export const FolderTreeIcon = createIcon(HugeFolderTreeIcon);
export const GaugeIcon = createIcon(HugeGaugeIcon);
export const GitBranch = createIcon(HugeGitBranchIcon);
export const GitBranchIcon = createIcon(HugeGitBranchIcon);
export const GlobeIcon = createIcon(HugeGlobeIcon);
export const Handshake = createIcon(HugeHandshakeIcon);
export const HeartIcon = createIcon(FavouriteIcon);
export const HelpCircleIcon = createIcon(HugeHelpCircleIcon);
export const HomeIcon = createIcon(Home01Icon);
export const ImageIcon = createIcon(Image01Icon);
export const InfoIcon = createIcon(InformationCircleIcon);
export const LayersIcon = createIcon(Layers01Icon);
export const LayoutGridIcon = createIcon(HugeLayoutGridIcon);
export const Library = createIcon(LibraryIcon);
export const Link2Icon = createIcon(Link02Icon);
export const LinkIcon = createIcon(Link01Icon);
export const LockIcon = createIcon(HugeLockIcon);
export const LogIn = createIcon(Login01Icon);
export const LogOutIcon = createIcon(Logout01Icon);
export const Loader2Icon = createIcon(Loading03Icon);
export const MessageSquare = createIcon(Message01Icon);
export const MessageSquareIcon = createIcon(Message01Icon);
export const MessageSquarePlusIcon = createIcon(MessageAdd01Icon);
export const MicIcon = createIcon(Mic01Icon);
export const MaximizeIcon = createIcon(Maximize01Icon);
export const MinimizeIcon = createIcon(Minimize01Icon);
export const MinusIcon = createIcon(MinusSignIcon);
export const Monitor = createIcon(ComputerIcon);
export const MonitorIcon = createIcon(ComputerIcon);
export const Moon = createIcon(Moon02Icon);
export const MoonIcon = createIcon(Moon02Icon);
export const MoreHorizontalIcon = createIcon(HugeMoreHorizontalIcon);
export const MoreVerticalIcon = createIcon(HugeMoreVerticalIcon);
export const NotebookIcon = createIcon(HugeNotebookIcon);
export const PaletteIcon = createIcon(PaintBoardIcon);
export const PaperclipIcon = createIcon(Attachment01Icon);
export const PanelLeftIcon = createIcon(HugePanelLeftIcon);
export const PenLineIcon = createIcon(PenTool01Icon);
export const PencilIcon = createIcon(PencilEdit01Icon);
export const PinIcon = createIcon(Pin02Icon);
export const PinOffIcon = createIcon(HugePinOffIcon);
export const Play = createIcon(HugePlayIcon);
export const PlusIcon = createIcon(Add01Icon);
export const Quote = createIcon(QuoteUpIcon);
export const SaveIcon = createIcon(HugeSaveIcon);
export const Scale = createIcon(BalanceScaleIcon);
export const Search = createIcon(Search01Icon);
export const SearchIcon = createIcon(Search01Icon);
export const SettingsIcon = createIcon(Settings01Icon);
export const Shield = createIcon(Shield01Icon);
export const ShieldCheckIcon = createIcon(Shield01Icon);
export const ShieldIcon = createIcon(Shield01Icon);
export const Sparkles = createIcon(HugeSparklesIcon);
export const SparklesIcon = createIcon(HugeSparklesIcon);
export const SquareTerminal = createIcon(TerminalIcon);
export const SquareIcon = createIcon(HugeSquareIcon);
export const Sun = createIcon(Sun01Icon);
export const SunIcon = createIcon(Sun01Icon);
export const TableIcon = createIcon(HugeTableIcon);
export const TelescopeIcon = createIcon(Telescope01Icon);
export const ThumbsDownIcon = createIcon(HugeThumbsDownIcon);
export const ThumbsUpIcon = createIcon(HugeThumbsUpIcon);
export const Trash2Icon = createIcon(Delete02Icon);
export const TrendingUpIcon = createIcon(ChartUpIcon);
export const UploadCloudIcon = createIcon(CloudUploadIcon);
export const UploadIcon = createIcon(Upload01Icon);
export const UserRoundIcon = createIcon(UserIcon);
export const UsersRoundIcon = createIcon(UserMultipleIcon);
export const WrenchIcon = createIcon(Wrench01Icon);
export const RotateCcwIcon = createIcon(ArrowReloadHorizontalIcon);
export const XCircleIcon = createIcon(CancelCircleIcon);
export const XIcon = createIcon(Cancel01Icon);

// Shared icon-per-artifact-type mapping (used by the workspace library card and
// the in-chat artifact card). Lives here so every artifact surface draws from the
// same Hugeicons-backed set; the textual label / provenance copy stays app-side.
function getArtifactTypeIcon(artifactType: string | undefined): typeof FileTextIcon {
  switch (artifactType) {
    case "url":
      return LinkIcon;
    case "pdf":
      return FileTextIcon;
    case "docx":
      return FileIcon;
    case "html":
    case "code":
      return Code2Icon;
    case "svg":
      return ImageIcon;
    case "mermaid":
      return GitBranchIcon;
    case "json":
      return BracesIcon;
    case "csv":
      return TableIcon;
    case "plain_text":
      return FileTextIcon;
    default:
      return FileTextIcon;
  }
}

/** Renders the icon for an artifact type (markdown/pdf/url/…). Exposed as a
 *  component so consumers don't resolve a component during render. */
export function ArtifactTypeIcon({
  artifactType,
  className,
}: {
  artifactType: string | undefined;
  className?: string;
}) {
  const Icon = getArtifactTypeIcon(artifactType);
  return <Icon className={className} />;
}
