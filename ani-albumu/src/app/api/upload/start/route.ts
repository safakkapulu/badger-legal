import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { CANONICAL_MIME, MULTIPART_THRESHOLD, PART_SIZE, checkFile } from "@/lib/config";
import { env } from "@/lib/env";
import { getLimits } from "@/lib/event";
import { fail, readJson } from "@/lib/http";
import { clientIp, hit } from "@/lib/rate-limit";
import { createMultipart, presignPut } from "@/lib/r2";
import { createToken } from "@/lib/token";
import { UPLOAD_PURPOSE, UPLOAD_TICKET_TTL, type UploadTicket } from "@/lib/upload-token";

type Body = { name: string; size: number; mime: string; withThumb: boolean; withDisplay: boolean };

export async function POST(req: Request) {
  const body = await readJson<Body>(req);
  if (!body || typeof body.name !== "string" || typeof body.size !== "number") return fail("Geçersiz istek.");

  if (!(await hit("upload", clientIp(req.headers), env.uploadRateLimit))) {
    return fail("Çok fazla yükleme denemesi. Lütfen birkaç dakika sonra tekrar deneyin.", 429);
  }

  const check = checkFile(body.name, typeof body.mime === "string" ? body.mime : "", body.size, getLimits());
  if (!check.ok) return fail(check.error);

  const id = randomUUID();
  const base = `medya/${id}`;
  const contentType = CANONICAL_MIME[check.ext];
  const key = `${base}/orijinal.${check.ext}`;
  const thumbKey = body.withThumb ? `${base}/onizleme.jpg` : null;
  const displayKey = body.withDisplay && check.type === "photo" ? `${base}/foto.jpg` : null;

  const multipart = body.size > MULTIPART_THRESHOLD;
  const uploadId = multipart ? await createMultipart(key, contentType) : null;
  const partCount = multipart ? Math.ceil(body.size / PART_SIZE) : null;

  const ticket: UploadTicket = {
    id,
    name: body.name.slice(0, 200),
    ext: check.ext,
    type: check.type,
    size: body.size,
    contentType,
    key,
    thumbKey,
    displayKey,
    uploadId,
    partCount,
  };

  const [url, thumbUrl, displayUrl] = await Promise.all([
    multipart ? null : presignPut(key, contentType),
    thumbKey ? presignPut(thumbKey, "image/jpeg") : null,
    displayKey ? presignPut(displayKey, "image/jpeg") : null,
  ]);

  return NextResponse.json({
    token: createToken(ticket, UPLOAD_PURPOSE, UPLOAD_TICKET_TTL),
    contentType,
    url,
    multipart: multipart ? { partSize: PART_SIZE, partCount } : null,
    thumbUrl,
    displayUrl,
  });
}
