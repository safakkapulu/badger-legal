import { NextResponse } from "next/server";
import { MB } from "@/lib/config";
import { insertMedia } from "@/lib/db";
import { fail, readJson } from "@/lib/http";
import { completeMultipart, deleteObjects, headObject, readHead } from "@/lib/r2";
import { sniff } from "@/lib/sniff";
import { verifyToken } from "@/lib/token";
import { UPLOAD_PURPOSE, type UploadTicket } from "@/lib/upload-token";

type Body = { token: string; parts: { PartNumber: number; ETag: string }[]; uploaderName: string };

const MAX_THUMB = 3 * MB;
const MAX_DISPLAY = 60 * MB;

function cleanName(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim().slice(0, 60);
  return s || null;
}

async function optionalObject(key: string | null, max: number): Promise<{ key: string | null; size: number }> {
  if (!key) return { key: null, size: 0 };
  const head = await headObject(key);
  if (!head || head.size === 0 || head.size > max) {
    if (head) await deleteObjects([key]);
    return { key: null, size: 0 };
  }
  return { key, size: head.size };
}

export async function POST(req: Request) {
  const body = await readJson<Body>(req);
  const t = verifyToken<UploadTicket>(body?.token, UPLOAD_PURPOSE);
  if (!t) return fail("Yükleme oturumu geçersiz ya da süresi dolmuş.", 401);

  if (t.uploadId) {
    const parts = body?.parts;
    const valid =
      Array.isArray(parts) &&
      parts.length === t.partCount &&
      parts.every((p) => Number.isInteger(p?.PartNumber) && typeof p?.ETag === "string" && p.ETag.length > 0) &&
      new Set(parts.map((p) => p.PartNumber)).size === t.partCount;
    if (!valid) return fail("Parça listesi eksik.");
    try {
      await completeMultipart(t.key, t.uploadId, parts!.map((p) => ({ PartNumber: p.PartNumber, ETag: p.ETag })));
    } catch (e) {
      // Önceki deneme tamamlanmış ama yanıt istemciye ulaşmamış olabilir
      if (!(await headObject(t.key))) {
        console.error("completeMultipart", e);
        return fail("Video birleştirilemedi, lütfen tekrar deneyin.", 502);
      }
    }
  }

  const head = await headObject(t.key);
  if (!head) return fail("Dosya depoya ulaşmamış, lütfen tekrar deneyin.", 409);
  if (head.size !== t.size) {
    await deleteObjects([t.key, t.thumbKey, t.displayKey]);
    return fail("Dosya boyutu beklenenden farklı.");
  }

  const detected = sniff(await readHead(t.key));
  if (!detected || detected.type !== t.type) {
    await deleteObjects([t.key, t.thumbKey, t.displayKey]);
    return fail("Dosya içeriği geçerli bir fotoğraf/video değil.");
  }

  const [thumb, display] = await Promise.all([
    optionalObject(t.thumbKey, MAX_THUMB),
    optionalObject(t.displayKey, MAX_DISPLAY),
  ]);

  await insertMedia({
    id: t.id,
    r2_key: t.key,
    thumb_key: thumb.key,
    display_key: display.key,
    type: t.type,
    content_type: t.contentType,
    original_name: t.name,
    size_bytes: head.size + thumb.size + display.size,
    uploader_name: cleanName(body?.uploaderName),
    created_at: Date.now(),
  });

  return NextResponse.json({ ok: true, id: t.id });
}
