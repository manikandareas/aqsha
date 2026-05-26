import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

export const AVATAR_STORAGE_PREFIX = "storage:";

const maxAvatarBytes = 5 * 1024 * 1024;

export async function resolveUserImage(
  ctx: QueryCtx,
  image: string | null | undefined,
): Promise<string | null> {
  if (!image) return null;
  if (!image.startsWith(AVATAR_STORAGE_PREFIX)) return image;

  const storageId = image.slice(AVATAR_STORAGE_PREFIX.length) as Id<"_storage">;
  const url = await ctx.storage.getUrl(storageId);
  return url ?? image;
}

export function avatarStorageIdFromImage(image: string | null | undefined) {
  if (!image?.startsWith(AVATAR_STORAGE_PREFIX)) return null;
  return image.slice(AVATAR_STORAGE_PREFIX.length) as Id<"_storage">;
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
