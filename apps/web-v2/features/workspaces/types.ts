// Tipe lokal workspace/folder untuk komponen (struktural — cocok dengan shape
// yang di-infer Eden dari api-v2). Sengaja TIDAK import @aqsha/db agar drizzle
// tak masuk bundle client.

export type Workspace = {
  id: string;
  ownerUserId: string;
  name: string;
  emoji: string | null;
  description: string | null;
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

export const isArchived = (w: Pick<Workspace, "status">): boolean => w.status === "archived";
