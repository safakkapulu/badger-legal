import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "./env";

// Sunucu durumu tutmadan, sunucunun ürettiği bilgileri (anahtarlar, uploadId, boyut)
// istemci üzerinden imzalı olarak taşımak için kullanılır.

function sign(data: string, purpose: string) {
  return createHmac("sha256", env.sessionSecret).update(`${purpose}.${data}`).digest("base64url");
}

export function createToken(payload: object, purpose: string, ttlSeconds: number): string {
  const data = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + ttlSeconds * 1000 })).toString("base64url");
  return `${data}.${sign(data, purpose)}`;
}

export function verifyToken<T>(token: unknown, purpose: string): T | null {
  if (typeof token !== "string") return null;
  const [data, mac] = token.split(".");
  if (!data || !mac) return null;
  const expected = Buffer.from(sign(data, purpose));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const payload = JSON.parse(Buffer.from(data, "base64url").toString()) as T & { exp: number };
    if (typeof payload.exp !== "number" || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
