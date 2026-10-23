import { NextResponse } from "next/server";
import { fail, readJson } from "@/lib/http";
import { presignPart, presignPut } from "@/lib/r2";
import { verifyToken } from "@/lib/token";
import { UPLOAD_PURPOSE, type UploadTicket } from "@/lib/upload-token";

type Body = { token: string; parts: number[]; main: boolean; thumb: boolean; display: boolean };

// Mevcut bir yükleme için taze imzalı URL'ler verir: multipart parçaları gerektikçe
// istenir, tekrar denemelerde de süresi dolmuş URL'lerin yerine kullanılır.
export async function POST(req: Request) {
  const body = await readJson<Body>(req);
  const t = verifyToken<UploadTicket>(body?.token, UPLOAD_PURPOSE);
  if (!t) return fail("Yükleme oturumu geçersiz ya da süresi dolmuş.", 401);

  const nums = body?.parts ?? [];
  if (
    !Array.isArray(nums) ||
    nums.length > 50 ||
    (nums.length > 0 && (!t.uploadId || !t.partCount)) ||
    !nums.every((n) => Number.isInteger(n) && n >= 1 && n <= (t.partCount ?? 0))
  ) {
    return fail("Geçersiz parça numarası.");
  }

  const parts: Record<number, string> = {};
  const [url, thumbUrl, displayUrl] = await Promise.all([
    body?.main && !t.uploadId ? presignPut(t.key, t.contentType) : null,
    body?.thumb && t.thumbKey ? presignPut(t.thumbKey, "image/jpeg") : null,
    body?.display && t.displayKey ? presignPut(t.displayKey, "image/jpeg") : null,
    ...nums.map(async (n) => {
      parts[n] = await presignPart(t.key, t.uploadId!, n);
    }),
  ]);
  return NextResponse.json({ parts, url, thumbUrl, displayUrl });
}
