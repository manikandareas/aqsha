import {
	BookmarkIcon,
	BookOpenIcon,
	ChartColumnIcon,
	CheckCircle2Icon,
	FileTextIcon,
	FolderIcon,
	GlobeIcon,
	type IconSvgElement,
	Library,
	NotebookIcon,
	PencilIcon,
	PenLineIcon,
	Quote,
	Scale,
	SearchIcon,
	ShieldCheckIcon,
	Trash2Icon,
	WrenchIcon
} from '$lib/icons';

/**
 * Semantic per-tool icon (cosmetic — `model.name` is always present). Unknown tool → wrench. Mirror of
 * the `ToolGlyph` switch in `tool-row.tsx`. Deep-research step ids (`draft-plan`, `search-literature`,
 * …) each get their own phase glyph; normal tools map by name.
 */
export function toolGlyph(name: string): IconSvgElement {
	switch (name) {
		// ── deep-research steps (`name` = stepId) ──
		case 'draft-plan':
			return NotebookIcon;
		case 'approve-plan':
			return CheckCircle2Icon;
		case 'search-literature':
			return Library;
		case 'counter-evidence':
			return Scale;
		case 'assign-citations':
			return Quote;
		case 'analyze-sources':
			return ChartColumnIcon;
		case 'verify-citations':
		case 'verify_citations':
		case 'verify_identifiers':
			return ShieldCheckIcon;
		case 'synthesize':
			return PencilIcon;
		// ── normal tools ──
		case 'search_web':
			return GlobeIcon;
		case 'search_thread_documents':
			return SearchIcon;
		case 'search_papers':
		case 'lookup_doi':
		case 'search_arxiv':
			return BookOpenIcon;
		case 'list_artifacts':
		case 'get_artifact':
		case 'get_render_payload':
			return FileTextIcon;
		case 'list_workspaces':
		case 'create_workspace':
		case 'rename_workspace':
		case 'link_to_workspace':
			return FolderIcon;
		case 'save_url':
			return BookmarkIcon;
		case 'propose_artifact':
		case 'execute_artifact':
			return PenLineIcon;
		case 'delete_artifact':
			return Trash2Icon;
		default:
			return WrenchIcon;
	}
}
