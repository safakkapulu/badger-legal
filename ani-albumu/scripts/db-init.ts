// Kullanım: npm run db:init — tabloları oluşturur (tekrar çalıştırmak güvenlidir).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@libsql/client";

async function main() {
  const url = process.env.TURSO_DATABASE_URL;
  if (!url) throw new Error("TURSO_DATABASE_URL tanımlı değil (.env)");
  const client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN || undefined });
  const sql = readFileSync(join(__dirname, "..", "src", "lib", "schema.sql"), "utf8");
  await client.executeMultiple(sql);
  const res = await client.execute("SELECT COUNT(*) AS n FROM media");
  console.log(`Veritabanı hazır. Kayıtlı medya: ${res.rows[0].n}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
