/**
 * Registry query key terpusat untuk TanStack Query. Port VERBATIM dari `apps/web/lib/api-query.ts`
 * agar cache key byte-equivalent lintas app (kontrak §11.2). Feature hooks (`features/<x>/api.ts` di
 * fase berikut) memakai key ini untuk `createQuery`/`createMutation` + `queryClient.invalidateQueries`.
 *
 * Konvensi invalidation (§3.6): invalidasi Query lewat `queryClient.invalidateQueries({ queryKey })`;
 * `load`/`depends`/`invalidate` HANYA untuk data yang di-load SSR-first — jangan campur dua sumber
 * kebenaran untuk data yang sama.
 *
 * Modul pure (tanpa runtime import) → aman di browser bundle & unit-testable.
 */
export const queryKeys = {
	workspaces: {
		all: ['workspaces'] as const,
		list: (params: { includeArchived: boolean }) => ['workspaces', 'list', params] as const,
		detail: (id: string) => ['workspaces', 'detail', id] as const
	},
	folders: {
		list: (workspaceId: string) => ['folders', 'list', workspaceId] as const
	},
	artifacts: {
		all: ['artifacts'] as const,
		list: (workspaceId: string, folderId: string | null) =>
			['artifacts', 'list', workspaceId, folderId] as const,
		detail: (id: string) => ['artifacts', 'detail', id] as const,
		render: (id: string) => ['artifacts', 'render', id] as const
	},
	feed: {
		all: ['feed'] as const,
		list: (params: { mode: string; topic: string | null }) => ['feed', 'list', params] as const,
		item: (id: string) => ['feed', 'item', id] as const
	},
	papers: {
		detail: (key: string) => ['papers', 'detail', key] as const,
		search: (params: { query: string; fromYear: number | null }) =>
			['papers', 'search', params] as const
	},
	billing: {
		all: ['billing'] as const,
		current: () => ['billing', 'current'] as const,
		plans: () => ['billing', 'plans'] as const,
		usage: (days: number) => ['billing', 'usage', days] as const
	},
	threads: {
		all: ['threads'] as const,
		list: () => ['threads', 'list'] as const,
		pinned: () => ['threads', 'pinned'] as const,
		detail: (id: string) => ['threads', 'detail', id] as const,
		messages: (id: string) => ['threads', 'messages', id] as const,
		events: (id: string) => ['threads', 'events', id] as const,
		sources: (id: string) => ['threads', 'sources', id] as const,
		statsBlocks: (id: string) => ['threads', 'stats-blocks', id] as const,
		artifacts: (id: string) => ['threads', 'artifacts', id] as const,
		sendStatus: (feature: 'normal_chat' | 'deep_research' = 'normal_chat') =>
			['threads', 'send-status', feature] as const
	},
	citations: {
		all: ['citations'] as const,
		workspace: (workspaceId: string) => ['citations', workspaceId] as const,
		list: (
			workspaceId: string,
			params: { q: string; status: string | null; source: string | null; tag: string | null }
		) => ['citations', workspaceId, 'list', params] as const,
		detail: (workspaceId: string, citationId: string) =>
			['citations', workspaceId, 'detail', citationId] as const,
		tags: (workspaceId: string) => ['citations', workspaceId, 'tags'] as const,
		duplicates: (workspaceId: string) => ['citations', workspaceId, 'duplicates'] as const,
		render: (workspaceId: string, params: { styleId: string | null; ids: string[] }) =>
			['citations', workspaceId, 'render', params] as const,
		renderDocument: (workspaceId: string, signature: string) =>
			['citations', workspaceId, 'render-document', signature] as const,
		settings: (workspaceId: string) => ['citations', workspaceId, 'settings'] as const
	},
	integrations: {
		all: ['integrations'] as const,
		list: () => ['integrations', 'list'] as const,
		folders: (provider: string) => ['integrations', 'folders', provider] as const
	},
	user: {
		me: () => ['user', 'me'] as const
	},
	security: {
		sessions: () => ['security', 'sessions'] as const
	},
	onboarding: {
		status: () => ['onboarding', 'status'] as const
	},
	preferences: {
		all: ['preferences'] as const,
		detail: () => ['preferences', 'detail'] as const
	}
};
