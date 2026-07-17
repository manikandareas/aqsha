// Tipe lokal workspace/proyek untuk komponen (struktural — cocok dengan shape
// yang di-infer Eden dari api). Sengaja TIDAK import @aqsha/db agar drizzle
// tak masuk bundle client.

export const WORKSPACE_KINDS = [
	'undergraduate_thesis',
	'masters_thesis',
	'dissertation',
	'journal_article',
	'proposal',
	'paper',
	'freeform'
] as const;
export type WorkspaceKind = (typeof WORKSPACE_KINDS)[number];

export const WORKSPACE_STAGES = [
	'exploration',
	'proposal',
	'research',
	'writing',
	'revision',
	'done'
] as const;
export type WorkspaceStage = (typeof WORKSPACE_STAGES)[number];

export const SECTION_STATUSES = ['empty', 'draft', 'in_review', 'done'] as const;
export type SectionStatus = (typeof SECTION_STATUSES)[number];

export type Workspace = {
	id: string;
	ownerUserId: string;
	name: string;
	emoji: string | null;
	description: string | null;
	kind: WorkspaceKind;
	stage: WorkspaceStage;
	deadline: number | null;
	topicNote: string | null;
	status: string; // "active" | "archived"
	archivedAt: number | null;
	createdAt: number;
	updatedAt: number;
};

export type WorkspaceSection = {
	id: string;
	workspaceId: string;
	title: string;
	sortOrder: number;
	status: SectionStatus;
	role: 'bibliography' | null;
	documentArtifactId: string | null;
	createdAt: number;
	updatedAt: number;
};

export type Folder = {
	id: string;
	ownerUserId: string;
	workspaceId: string;
	name: string;
	status: string; // "active" (list hanya aktif)
	createdAt: number;
	updatedAt: number;
	deletedAt: number | null;
};

export const isArchived = (w: Pick<Workspace, 'status'>): boolean => w.status === 'archived';

/** Judul tampilan proyek: nama, fallback topik kasar selama eksplorasi. */
export function projectDisplayTitle(w: Pick<Workspace, 'name' | 'topicNote'>): string {
	return w.name.trim() || w.topicNote?.trim() || 'Proyek tanpa judul';
}
