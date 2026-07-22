/**
 * Icon boundary for apps/svelte.
 *
 * Must stay glyph-identical to `packages/ui/src/icons.tsx` (`@aqsha/ui/icons`): every
 * Aqsha-facing (Lucide-compatible) icon name maps to the SAME Hugeicons glyph (guarded by
 * `icons.completeness.spec.ts`). App code (everything except vendored `src/lib/components/ui/**`)
 * imports icons from `$lib/icons`; direct `@lucide/svelte` imports are banned by eslint.
 *
 * Usage (Svelte/Hugeicons idiom — the glyph is DATA, not a component):
 *   import { Icon, CheckIcon } from '$lib/icons';
 *   <Icon icon={CheckIcon} class="size-4" />
 *
 * `@hugeicons/svelte` renders via a single `HugeiconsIcon` that takes the glyph as a prop —
 * the same pattern shadcn-svelte vendored components already use. Stroke/size defaults come from
 * `HugeiconsIcon`; size is driven by `size-*` classes.
 *
 * GOTCHA: Hugeicons glyph names ≠ Lucide names (e.g. Lucide `Maximize01` glyph
 * is a hand-cursor — the open/expand affordance uses `ArrowExpand01Icon`). The
 * mapping below is authoritative; keep it in lockstep with `packages/ui/src/icons.tsx`.
 */
export { HugeiconsIcon as Icon } from '@hugeicons/svelte';
export type { HugeiconsProps, IconSvgElement } from '@hugeicons/svelte';

// Aqsha name → Hugeicons core-free glyph. Must match packages/ui/src/icons.tsx.
// Ordered/grouped to match `packages/ui/src/icons.tsx` for review-by-diff.
export {
	AlertCircleIcon as AlertCircleIcon,
	ArchiveIcon as ArchiveIcon,
	ArrangeByLettersAZIcon as ArrowDownAZIcon,
	ArrowDown01Icon as ArrowDownIcon,
	ArrowLeft01Icon as ArrowLeftIcon,
	ArrowRight01Icon as ArrowRight,
	ArrowRight01Icon as ArrowRightIcon,
	ArrowUp01Icon as ArrowUpIcon,
	ArrowUpToLineIcon as ArrowUpToLineIcon,
	ArrowUpRight01Icon as ArrowUpRightIcon,
	BookOpen01Icon as BookOpen,
	BookOpen01Icon as BookOpenIcon,
	Bookmark01Icon as BookmarkIcon,
	BracesIcon as BracesIcon,
	Calendar03Icon as CalendarRangeIcon,
	Camera01Icon as CameraIcon,
	ChartColumnIcon as ChartColumnIcon,
	CheckIcon as Check,
	CheckmarkCircle02Icon as CheckCircle2,
	CheckIcon as CheckIcon,
	CheckmarkCircle02Icon as CheckCircle2Icon,
	ChevronDownIcon as ChevronDown,
	ChevronDownIcon as ChevronDownIcon,
	ChevronRightIcon as ChevronRight,
	ChevronRightIcon as ChevronRightIcon,
	ChevronUpIcon as ChevronUpIcon,
	ChevronsDownUpIcon as ChevronsUpDownIcon,
	CircleIcon as Circle,
	CircleIcon as CircleIcon,
	Clock03Icon as Clock3,
	Clock03Icon as ClockIcon,
	CompassIcon as CompassIcon,
	CodeXmlIcon as Code2,
	CodeXmlIcon as Code2Icon,
	Copy01Icon as CopyIcon,
	CornerDownLeftIcon as CornerDownLeftIcon,
	CreditCardIcon as CreditCardIcon,
	Dollar01Icon as DollarSign,
	Download01Icon as DownloadIcon,
	ExternalLinkIcon as ExternalLinkIcon,
	ExpandParagraphIcon as ExpandParagraphIcon,
	EyeIcon as EyeIcon,
	FileDownloadIcon as FileDownIcon,
	File01Icon as FileIcon,
	FileScriptIcon as FileText,
	FileScriptIcon as FileTextIcon,
	FilterIcon as FilterIcon,
	Flag01Icon as Flag,
	Flag01Icon as FlagIcon,
	FlaskConicalIcon as FlaskConicalIcon,
	Folder01Icon as FolderIcon,
	FolderTreeIcon as FolderTreeIcon,
	GaugeIcon as GaugeIcon,
	GitBranchIcon as GitBranch,
	GitBranchIcon as GitBranchIcon,
	GlobeIcon as GlobeIcon,
	HandshakeIcon as Handshake,
	FavouriteIcon as HeartIcon,
	HelpCircleIcon as HelpCircleIcon,
	Home01Icon as HomeIcon,
	Image01Icon as ImageIcon,
	InformationCircleIcon as InfoIcon,
	Layers01Icon as LayersIcon,
	LayoutGridIcon as LayoutGridIcon,
	LibraryIcon as Library,
	Link02Icon as Link2Icon,
	Link01Icon as LinkIcon,
	LockIcon as LockIcon,
	Login01Icon as LogIn,
	Logout01Icon as LogOutIcon,
	Loading03Icon as Loader2Icon,
	Message01Icon as MessageSquare,
	Message01Icon as MessageSquareIcon,
	MessageAdd01Icon as MessageSquarePlusIcon,
	Mic01Icon as MicIcon,
	Maximize01Icon as MaximizeIcon,
	ArrowExpand01Icon as ExpandIcon,
	ArrowShrink02Icon as ShrinkIcon,
	Minimize01Icon as MinimizeIcon,
	MinusSignIcon as MinusIcon,
	ComputerIcon as Monitor,
	ComputerIcon as MonitorIcon,
	Moon02Icon as Moon,
	Moon02Icon as MoonIcon,
	MoreHorizontalIcon as MoreHorizontalIcon,
	MoreVerticalIcon as MoreVerticalIcon,
	NotebookIcon as NotebookIcon,
	PaintBoardIcon as PaletteIcon,
	Attachment01Icon as PaperclipIcon,
	PanelLeftIcon as PanelLeftIcon,
	PenTool01Icon as PenLineIcon,
	PencilEdit01Icon as PencilIcon,
	Pin02Icon as PinIcon,
	PinOffIcon as PinOffIcon,
	PlayIcon as Play,
	PlugSocketIcon as PlugIcon,
	Add01Icon as PlusIcon,
	Add02Icon as Add02Icon,
	QuoteUpIcon as Quote,
	SaveIcon as SaveIcon,
	BalanceScaleIcon as Scale,
	Search01Icon as Search,
	Search01Icon as SearchIcon,
	Settings01Icon as SettingsIcon,
	Shield01Icon as Shield,
	Shield01Icon as ShieldCheckIcon,
	Shield01Icon as ShieldIcon,
	SparklesIcon as Sparkles,
	SparklesIcon as SparklesIcon,
	TerminalIcon as SquareTerminal,
	SquareIcon as SquareIcon,
	Sun01Icon as Sun,
	Sun01Icon as SunIcon,
	TableIcon as TableIcon,
	Telescope01Icon as TelescopeIcon,
	ThumbsDownIcon as ThumbsDownIcon,
	ThumbsUpIcon as ThumbsUpIcon,
	Delete02Icon as Trash2Icon,
	ChartUpIcon as TrendingUpIcon,
	CloudUploadIcon as UploadCloudIcon,
	Upload01Icon as UploadIcon,
	UserIcon as UserRoundIcon,
	UserMultipleIcon as UsersRoundIcon,
	Wrench01Icon as WrenchIcon,
	ArrowReloadHorizontalIcon as RotateCcwIcon,
	CancelCircleIcon as XCircleIcon,
	Cancel01Icon as XIcon
} from '@hugeicons/core-free-icons';

import type { IconSvgElement } from '@hugeicons/svelte';
import {
	Link01Icon,
	FileScriptIcon,
	File01Icon,
	CodeXmlIcon,
	Image01Icon,
	GitBranchIcon,
	BracesIcon,
	TableIcon
} from '@hugeicons/core-free-icons';

/**
 * Shared icon-per-artifact-type mapping — same contract as `getArtifactTypeIcon` in
 * packages/ui/src/icons.tsx. Returns the Hugeicons glyph; render with
 * `<Icon icon={getArtifactTypeIcon(type)} />`.
 */
export function getArtifactTypeIcon(artifactType: string | undefined): IconSvgElement {
	switch (artifactType) {
		case 'url':
			return Link01Icon;
		case 'pdf':
			return FileScriptIcon;
		case 'docx':
			return File01Icon;
		case 'html':
		case 'code':
			return CodeXmlIcon;
		case 'svg':
			return Image01Icon;
		case 'mermaid':
			return GitBranchIcon;
		case 'json':
			return BracesIcon;
		case 'csv':
			return TableIcon;
		case 'plain_text':
			return FileScriptIcon;
		default:
			return FileScriptIcon;
	}
}
