// Sunucu ve istemci tarafından paylaşılan sabitler (gizli bilgi içermez).

export const MB = 1024 * 1024;

/** 50 MB üstü dosyalar multipart yüklenir. */
export const MULTIPART_THRESHOLD = 50 * MB;
/** Zayıf bağlantıda tek parça kaybı en fazla bu kadar veriyi yeniden göndertir. */
export const PART_SIZE = 8 * MB;

export type MediaType = "photo" | "video";

type FileKind = { type: MediaType; mimes: string[] };

/**
 * İzinli uzantılar ve her uzantı için kabul edilen MIME türleri.
 * Bazı tarayıcılar (Windows/Android) HEIC için boş MIME gönderir; bunlara sunucu
 * tarafında dosya imzası (magic bytes) kontrolüyle izin verilir.
 */
export const ALLOWED: Record<string, FileKind> = {
  jpg: { type: "photo", mimes: ["image/jpeg"] },
  jpeg: { type: "photo", mimes: ["image/jpeg"] },
  png: { type: "photo", mimes: ["image/png"] },
  heic: { type: "photo", mimes: ["image/heic", "image/heif", "image/heic-sequence", "image/heif-sequence", ""] },
  heif: { type: "photo", mimes: ["image/heic", "image/heif", "image/heic-sequence", "image/heif-sequence", ""] },
  mp4: { type: "video", mimes: ["video/mp4"] },
  mov: { type: "video", mimes: ["video/quicktime", "video/mp4"] },
};

/** R2'ye yazılacak, uzantıya göre normalleştirilmiş Content-Type. */
export const CANONICAL_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  heic: "image/heic",
  heif: "image/heif",
  mp4: "video/mp4",
  mov: "video/quicktime",
};

// Telefonlarda galeri seçicisinin açılması için geniş tutulur; tür kontrolü seçimden sonra yapılır
// (Android'de uzantı listesi verilince galeri yerine dosya yöneticisi açılabiliyor).
export const ACCEPT_ATTR = "image/*,video/*";

export function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i === -1 ? "" : name.slice(i + 1).toLowerCase();
}

export type Limits = { photoBytes: number; videoBytes: number };

export function checkFile(
  name: string,
  mime: string,
  size: number,
  limits: Limits,
): { ok: true; ext: string; type: MediaType } | { ok: false; error: string } {
  const ext = extOf(name);
  const kind = ALLOWED[ext];
  if (!kind) return { ok: false, error: "Bu dosya türü desteklenmiyor (jpg, png, heic, mp4, mov)." };
  const m = (mime || "").toLowerCase();
  if (m !== "application/octet-stream" && !kind.mimes.includes(m)) {
    return { ok: false, error: "Dosya türü uzantısıyla uyuşmuyor." };
  }
  if (m === "application/octet-stream" && kind.type !== "photo") {
    return { ok: false, error: "Dosya türü tanınamadı." };
  }
  if (size <= 0) return { ok: false, error: "Dosya boş." };
  const max = kind.type === "photo" ? limits.photoBytes : limits.videoBytes;
  if (size > max) {
    return {
      ok: false,
      error: `Dosya çok büyük (en fazla ${Math.round(max / MB)} MB ${kind.type === "photo" ? "fotoğraf" : "video"}).`,
    };
  }
  return { ok: true, ext, type: kind.type };
}
