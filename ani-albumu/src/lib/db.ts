import "server-only";
import { createClient, type Client } from "@libsql/client";
import { env } from "./env";
import type { MediaType } from "./config";

let client: Client | null = null;

export function db(): Client {
  if (!client) client = createClient({ url: env.tursoUrl, authToken: env.tursoToken });
  return client;
}

export type MediaRow = {
  id: string;
  r2_key: string;
  thumb_key: string | null;
  display_key: string | null;
  type: MediaType;
  content_type: string;
  original_name: string;
  size_bytes: number;
  uploader_name: string | null;
  created_at: number;
  hidden: number;
};

export async function insertMedia(row: Omit<MediaRow, "hidden">) {
  await db().execute({
    sql: `INSERT INTO media (id, r2_key, thumb_key, display_key, type, content_type, original_name, size_bytes, uploader_name, created_at, hidden)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
          ON CONFLICT(id) DO NOTHING`,
    args: [
      row.id,
      row.r2_key,
      row.thumb_key,
      row.display_key,
      row.type,
      row.content_type,
      row.original_name,
      row.size_bytes,
      row.uploader_name,
      row.created_at,
    ],
  });
}
