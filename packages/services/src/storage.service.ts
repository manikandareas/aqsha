import * as s3 from "./clients/s3";
import { ARTIFACT_BODY_INLINE_LIMIT } from "./artifacts/model";

/**
 * StorageService — wrapper domain tipis di atas `clients/s3.ts` (object storage
 * S3-compatible: MinIO/R2/S3). Satu rumah untuk presign upload, signed read,
 * store/offload teks, baca blob, hapus. Threshold inline-vs-storage
 * (`ARTIFACT_BODY_INLINE_LIMIT`) tinggal di `maybeOffloadText`. Key storage stabil
 * lintas move (workspace-agnostic, mirror catatan V1).
 */
function uploadKey(ownerUserId: string): string {
  return `artifacts/${ownerUserId}/${crypto.randomUUID()}`;
}

function textBlobKey(ownerUserId: string, artifactId: string, kind: string): string {
  return `artifacts/${ownerUserId}/${artifactId}/${kind}-${crypto.randomUUID()}`;
}

export const StorageService = {
  /** Step 1 presign: generate key + presigned PUT URL (mime belum diketahui). */
  async generateUploadTarget(ownerUserId: string): Promise<{ uploadUrl: string; key: string }> {
    const key = uploadKey(ownerUserId);
    const uploadUrl = await s3.presignPut(key);
    return { uploadUrl, key };
  },

  /** Presigned GET segar (reader pdf/docx). */
  getSignedReadUrl(key: string, ttlSeconds?: number): Promise<string> {
    return s3.presignGet(key, ttlSeconds);
  },

  readBytes(key: string): Promise<Uint8Array> {
    return s3.getObjectBytes(key);
  },

  readText(key: string): Promise<string> {
    return s3.getObjectText(key);
  },

  /** Simpan teks ke storage, kembalikan key. */
  async storeText(
    ownerUserId: string,
    artifactId: string,
    kind: string,
    value: string,
    contentType = "text/plain",
  ): Promise<string> {
    const key = textBlobKey(ownerUserId, artifactId, kind);
    await s3.putObject(key, value, contentType);
    return key;
  },

  /** Simpan byte (mis. OA PDF hasil download) ke storage, kembalikan key. */
  async storeBytes(
    ownerUserId: string,
    artifactId: string,
    kind: string,
    bytes: Uint8Array,
    contentType: string,
  ): Promise<string> {
    const key = textBlobKey(ownerUserId, artifactId, kind);
    await s3.putObject(key, bytes, contentType);
    return key;
  },

  /** Offload bila teks > inline limit → kembalikan storage key; else undefined (inline). */
  async maybeOffloadText(
    ownerUserId: string,
    artifactId: string,
    kind: string,
    value: string,
    contentType = "text/plain",
  ): Promise<string | undefined> {
    if (value.length <= ARTIFACT_BODY_INLINE_LIMIT) return undefined;
    const key = textBlobKey(ownerUserId, artifactId, kind);
    await s3.putObject(key, value, contentType);
    return key;
  },

  deleteObject(key: string): Promise<void> {
    return s3.deleteObject(key);
  },

  /** Readiness probe object-storage (HeadBucket). true = reachable + akses ok. */
  async ping(): Promise<boolean> {
    try {
      await s3.headBucket();
      return true;
    } catch {
      return false;
    }
  },
};
