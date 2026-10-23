import "server-only";
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "./env";

let client: S3Client | null = null;

export function r2(): S3Client {
  if (!client) {
    client = new S3Client({
      region: "auto",
      endpoint: env.r2Endpoint,
      forcePathStyle: true,
      credentials: { accessKeyId: env.r2AccessKeyId, secretAccessKey: env.r2SecretAccessKey },
      // R2 yeni varsayılan checksum başlıklarını presigned PUT'larda desteklemiyor
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
  }
  return client;
}

const UPLOAD_URL_TTL = 60 * 60; // 1 saat
const VIEW_URL_TTL = 60 * 60; // galeri bağlantıları 1 saat geçerli

export function presignPut(key: string, contentType: string) {
  return getSignedUrl(r2(), new PutObjectCommand({ Bucket: env.r2Bucket, Key: key, ContentType: contentType }), {
    expiresIn: UPLOAD_URL_TTL,
    // Content-Type imzaya dahil edilir; istemci farklı bir tür beyan edemez
    signableHeaders: new Set(["content-type"]),
  });
}

export function presignGet(key: string, downloadName?: string) {
  return getSignedUrl(
    r2(),
    new GetObjectCommand({
      Bucket: env.r2Bucket,
      Key: key,
      ResponseContentDisposition: downloadName
        ? `attachment; filename*=UTF-8''${encodeURIComponent(downloadName)}`
        : undefined,
    }),
    { expiresIn: VIEW_URL_TTL },
  );
}

export async function createMultipart(key: string, contentType: string): Promise<string> {
  const res = await r2().send(
    new CreateMultipartUploadCommand({ Bucket: env.r2Bucket, Key: key, ContentType: contentType }),
  );
  if (!res.UploadId) throw new Error("Multipart yükleme başlatılamadı");
  return res.UploadId;
}

export function presignPart(key: string, uploadId: string, partNumber: number) {
  return getSignedUrl(
    r2(),
    new UploadPartCommand({ Bucket: env.r2Bucket, Key: key, UploadId: uploadId, PartNumber: partNumber }),
    { expiresIn: UPLOAD_URL_TTL },
  );
}

export async function completeMultipart(key: string, uploadId: string, parts: { PartNumber: number; ETag: string }[]) {
  await r2().send(
    new CompleteMultipartUploadCommand({
      Bucket: env.r2Bucket,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: { Parts: [...parts].sort((a, b) => a.PartNumber - b.PartNumber) },
    }),
  );
}

export async function abortMultipart(key: string, uploadId: string) {
  await r2().send(new AbortMultipartUploadCommand({ Bucket: env.r2Bucket, Key: key, UploadId: uploadId }));
}

/** Nesne yoksa null döner. */
export async function headObject(key: string): Promise<{ size: number } | null> {
  try {
    const res = await r2().send(new HeadObjectCommand({ Bucket: env.r2Bucket, Key: key }));
    return { size: res.ContentLength ?? 0 };
  } catch (e) {
    const status = (e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    if (status === 404) return null;
    throw e;
  }
}

/** Dosyanın ilk baytlarını okur (tür imzası kontrolü için). */
export async function readHead(key: string, bytes = 64): Promise<Uint8Array> {
  const res = await r2().send(
    new GetObjectCommand({ Bucket: env.r2Bucket, Key: key, Range: `bytes=0-${bytes - 1}` }),
  );
  if (!res.Body) return new Uint8Array();
  return res.Body.transformToByteArray();
}

export async function deleteObjects(keys: (string | null | undefined)[]) {
  const list = keys.filter((k): k is string => !!k);
  if (list.length === 0) return;
  await r2().send(
    new DeleteObjectsCommand({ Bucket: env.r2Bucket, Delete: { Objects: list.map((Key) => ({ Key })), Quiet: true } }),
  );
}
