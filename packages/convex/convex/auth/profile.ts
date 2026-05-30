import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import {
  assertAvatarStorageFile,
  AVATAR_STORAGE_PREFIX,
  deleteAvatarStorageIfPresent,
  resolveUserImage,
} from "../lib/userImage";
import { throwAppError } from "../lib/appError";
import { ensureCurrentUser, findUserByOwnerUserId, requireCurrentUser } from "./userRepository";

const maxDisplayNameLength = 120;

export async function getCurrentUserProfile(ctx: QueryCtx) {
  const user = await requireCurrentUser(ctx);

  return {
    id: user._id,
    name: user.name,
    email: user.email,
    emailVerified: user.emailVerified,
    image: await resolveUserImage(ctx, user.image),
  };
}

export async function generateAvatarUploadUrl(ctx: MutationCtx) {
  await requireCurrentUser(ctx);
  return await ctx.storage.generateUploadUrl();
}

export async function updateDisplayName(ctx: MutationCtx, nameInput: string) {
  const user = await requireCurrentUser(ctx);
  const name = nameInput.trim();
  if (!name) {
    throwAppError({
      code: "display_name_required",
      message: "Nama tampilan tidak boleh kosong.",
      field: "name",
    });
  }
  if (name.length > maxDisplayNameLength) {
    throwAppError({
      code: "display_name_too_long",
      message: `Nama tampilan maksimal ${maxDisplayNameLength} karakter.`,
      field: "name",
    });
  }

  const row = await findUserByOwnerUserId(ctx, user._id);
  if (row) {
    await ctx.db.patch("users", row._id, { name, updatedAt: Date.now() });
  }
}

export async function setAvatarFromStorage(ctx: MutationCtx, storageId: Id<"_storage">) {
  const user = await requireCurrentUser(ctx);
  await assertAvatarStorageFile(ctx, storageId);
  const previousImage = user.image;
  const nextImage = `${AVATAR_STORAGE_PREFIX}${storageId}`;

  const row = await findUserByOwnerUserId(ctx, user._id);
  if (row) {
    await ctx.db.patch("users", row._id, {
      image: nextImage,
      updatedAt: Date.now(),
    });
  }
  if (previousImage !== nextImage) {
    await deleteAvatarStorageIfPresent(ctx, previousImage);
  }
}

export async function syncCurrentUser(ctx: MutationCtx) {
  const user = await ensureCurrentUser(ctx);
  return {
    id: user._id,
    clerkUserId: user.clerkUserId,
  };
}
