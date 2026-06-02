import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export const AVATAR_STORAGE_PREFIX = "storage:";

const maxAvatarBytes = 5 * 1024 * 1024;

export async function resolveUserImage(
  ctx: QueryCtx,
  image: string | null | undefined,
): Promise<string | null> {
  if (!image) return null;
  if (!image.startsWith(AVATAR_STORAGE_PREFIX)) return image;

  const storageId = parseAvatarStorageId(image);
  if (!storageId) return image;
  const url = await ctx.storage.getUrl(storageId);
  return url ?? image;
}

export function parseAvatarStorageId(image: string | null | undefined) {
  if (!image?.startsWith(AVATAR_STORAGE_PREFIX)) return null;
  const storageId = image.slice(AVATAR_STORAGE_PREFIX.length).trim();
  return storageId ? (storageId as Id<"_storage">) : null;
}

export function avatarStorageIdFromImage(image: string | null | undefined) {
  return parseAvatarStorageId(image);
}

export async function deleteAvatarStorageIfPresent(
  ctx: Pick<MutationCtx, "storage">,
  image: string | null | undefined,
) {
  const storageId = parseAvatarStorageId(image);
  if (!storageId) return false;
  await ctx.storage.delete(storageId);
  return true;
}

export async function assertAvatarStorageFile(
  ctx: Pick<QueryCtx, "db">,
  storageId: Id<"_storage">,
) {
  const metadata = await ctx.db.system.get("_storage", storageId);
  if (!metadata) {
    throw new Error("File avatar tidak ditemukan.");
  }

  const contentType = metadata.contentType ?? "";
  if (!contentType.startsWith("image/")) {
    throw new Error("Avatar harus berupa gambar.");
  }

  if (metadata.size > maxAvatarBytes) {
    throw new Error("Ukuran avatar maksimal 5 MB.");
  }

  return metadata;
}
