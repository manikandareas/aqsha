import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Satu-satunya tempat key object-storage di-sign/baca/tulis/hapus (mengganti
 * `ctx.storage.*` Convex). Dipakai `StorageService` + worker `artifact-cleanup`.
 * Backend = S3-compatible (MinIO self-hosted di compose, atau Cloudflare R2/AWS S3).
 * MinIO butuh `forcePathStyle: true` (endpoint `http://host:9000/<bucket>/<key>`,
 * bukan virtual-hosted `<bucket>.host`). `region` di-set demi signer (MinIO terima
 * apa saja; default `us-east-1`).
 */
let client: S3Client | null = null;

const PUT_TTL_SECONDS = 3600;
const GET_TTL_SECONDS = 3600;

function getBucket(): string {
  const bucket = process.env.S3_BUCKET;
  if (!bucket) throw new Error("S3_BUCKET is required for object storage");
  return bucket;
}

export function getS3(): S3Client {
  if (client) return client;
  const endpoint = process.env.S3_ENDPOINT;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "S3_ENDPOINT / S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY are required for object storage",
    );
  }
  client = new S3Client({
    region: process.env.S3_REGION || "us-east-1",
    endpoint,
    // MinIO (dan kebanyakan S3-compatible self-hosted) hanya melayani path-style.
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
  });
  return client;
}

/**
 * Presigned PUT — client meng-upload byte file langsung ke object storage (tanpa
 * lewat API). `contentType` opsional: bila diisi, presign mengikat header
 * Content-Type (client wajib kirim sama persis); bila kosong, client bebas —
 * dipakai upload-url artifact yang belum tahu mime-nya.
 */
export function presignPut(key: string, contentType?: string): Promise<string> {
  return getSignedUrl(
    getS3(),
    new PutObjectCommand({
      Bucket: getBucket(),
      Key: key,
      ...(contentType ? { ContentType: contentType } : {}),
    }),
    { expiresIn: PUT_TTL_SECONDS },
  );
}

/** Presigned GET — dipakai reader (pdf/docx) untuk fetch fresh dari storage. */
export function presignGet(key: string, ttlSeconds: number = GET_TTL_SECONDS): Promise<string> {
  return getSignedUrl(getS3(), new GetObjectCommand({ Bucket: getBucket(), Key: key }), {
    expiresIn: ttlSeconds,
  });
}

export async function putObject(
  key: string,
  body: Uint8Array | string,
  contentType: string,
): Promise<void> {
  await getS3().send(
    new PutObjectCommand({ Bucket: getBucket(), Key: key, Body: body, ContentType: contentType }),
  );
}

export async function getObjectBytes(key: string): Promise<Uint8Array> {
  const res = await getS3().send(new GetObjectCommand({ Bucket: getBucket(), Key: key }));
  if (!res.Body) return new Uint8Array(0);
  return res.Body.transformToByteArray();
}

export async function getObjectText(key: string): Promise<string> {
  const res = await getS3().send(new GetObjectCommand({ Bucket: getBucket(), Key: key }));
  if (!res.Body) return "";
  return res.Body.transformToString();
}

export async function deleteObject(key: string): Promise<void> {
  await getS3().send(new DeleteObjectCommand({ Bucket: getBucket(), Key: key }));
}
