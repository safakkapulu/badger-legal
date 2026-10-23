import "server-only";
import { db } from "./db";

const WINDOW_MS = 10 * 60 * 1000;

export function clientIp(headers: Headers): string {
  // Vercel x-forwarded-for başlığını kendisi ayarlar; ilk değer gerçek istemcidir
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "bilinmiyor";
}

/**
 * Sabit pencereli sayaç; veritabanında tutulur ki tüm sunucu örnekleri ortak saysın.
 * Limit aşıldıysa false döner.
 */
export async function hit(bucket: string, ip: string, limit: number): Promise<boolean> {
  const now = Date.now();
  const res = await db().execute({
    sql: `INSERT INTO rate_limits (key, window_start, count) VALUES (?, ?, 1)
          ON CONFLICT(key) DO UPDATE SET
            count = CASE WHEN rate_limits.window_start <= ? THEN 1 ELSE rate_limits.count + 1 END,
            window_start = CASE WHEN rate_limits.window_start <= ? THEN excluded.window_start ELSE rate_limits.window_start END
          RETURNING count`,
    args: [`${bucket}:${ip}`, now, now - WINDOW_MS, now - WINDOW_MS],
  });
  return Number(res.rows[0]?.count ?? 0) <= limit;
}
