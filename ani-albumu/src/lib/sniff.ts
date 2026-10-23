import type { MediaType } from "./config";

// Dosyanın gerçek türünü ilk baytlarından tespit eder (uzantı/MIME taklidine karşı).

const ascii = (b: Uint8Array, start: number, end: number) => String.fromCharCode(...b.subarray(start, end));

const HEIF_BRANDS = ["heic", "heix", "heim", "heis", "hevc", "hevx", "mif1", "msf1"];
const VIDEO_BRANDS = ["isom", "iso2", "iso4", "iso5", "iso6", "mp41", "mp42", "avc1", "qt  ", "M4V ", "3gp4", "3gp5", "dash", "mmp4"];

export function sniff(b: Uint8Array): { type: MediaType; family: "jpeg" | "png" | "heif" | "video" } | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { type: "photo", family: "jpeg" };
  if (b.length >= 8 && ascii(b, 1, 4) === "PNG" && b[0] === 0x89) return { type: "photo", family: "png" };
  if (b.length >= 12) {
    const box = ascii(b, 4, 8);
    if (box === "ftyp") {
      const brands = [ascii(b, 8, 12)];
      for (let i = 16; i + 4 <= Math.min(b.length, 64); i += 4) brands.push(ascii(b, i, i + 4));
      if (brands.some((x) => HEIF_BRANDS.includes(x))) return { type: "photo", family: "heif" };
      if (brands.some((x) => VIDEO_BRANDS.includes(x))) return { type: "video", family: "video" };
      return null;
    }
    // Eski QuickTime dosyaları ftyp olmadan doğrudan atom ile başlayabilir
    if (["moov", "mdat", "wide", "free", "skip"].includes(box)) return { type: "video", family: "video" };
  }
  return null;
}

export const EXT_FAMILY: Record<string, string> = {
  jpg: "jpeg",
  jpeg: "jpeg",
  png: "png",
  heic: "heif",
  heif: "heif",
  mp4: "video",
  mov: "video",
};
