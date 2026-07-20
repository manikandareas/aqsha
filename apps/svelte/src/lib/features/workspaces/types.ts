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

/** Metadata per-kind yang dikumpulkan saat create (jsonb `kind_info`); superset flat, semua opsional. */
export type WorkspaceKindInfo = {
	university?: string | null;
	faculty?: string | null;
	studyProgram?: string | null;
	targetJournal?: string | null;
	affiliation?: string | null;
	courseOrVenue?: string | null;
};

export type WorkspaceKindInfoField = keyof WorkspaceKindInfo;

/** Field kind_info yang relevan per kind — untuk merender form create + sheet detail. */
export const WORKSPACE_KIND_INFO_FIELDS = {
	undergraduate_thesis: ['university', 'faculty', 'studyProgram'],
	masters_thesis: ['university', 'faculty', 'studyProgram'],
	dissertation: ['university', 'faculty', 'studyProgram'],
	proposal: ['university', 'faculty', 'studyProgram'],
	journal_article: ['targetJournal', 'affiliation'],
	paper: ['university', 'courseOrVenue'],
	freeform: []
} as const satisfies Record<WorkspaceKind, readonly WorkspaceKindInfoField[]>;

/** Kind yang menampung dokumen pedoman (PDF panduan penulisan) di form create + detail. */
export const THESIS_FAMILY_KINDS: readonly WorkspaceKind[] = [
	'undergraduate_thesis',
	'masters_thesis',
	'dissertation',
	'proposal'
];

export type Workspace = {
	id: string;
	ownerUserId: string;
	name: string;
	emoji: string | null;
	description: string | null;
	kind: WorkspaceKind;
	kindInfo: WorkspaceKindInfo | null;
	documentArtifactId: string | null;
	deadline: number | null;
	topicNote: string | null;
	status: string; // "active" | "archived"
	archivedAt: number | null;
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
