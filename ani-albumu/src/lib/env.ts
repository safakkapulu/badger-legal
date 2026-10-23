import "server-only";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Eksik ortam değişkeni: ${name} (.env.example dosyasına bakın)`);
  return value;
}

export const env = {
  get r2AccessKeyId() {
    return required("R2_ACCESS_KEY_ID");
  },
  get r2SecretAccessKey() {
    return required("R2_SECRET_ACCESS_KEY");
  },
  /** AB yargı alanındaki bucket'lar ya da yerel test için R2_ENDPOINT ile değiştirilebilir. */
  get r2Endpoint() {
    return process.env.R2_ENDPOINT || `https://${required("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`;
  },
  get r2Bucket() {
    return required("R2_BUCKET");
  },
  get tursoUrl() {
    return required("TURSO_DATABASE_URL");
  },
  get tursoToken() {
    return process.env.TURSO_AUTH_TOKEN || undefined;
  },
  get sessionSecret() {
    const s = required("SESSION_SECRET");
    if (s.length < 32) throw new Error("SESSION_SECRET en az 32 karakter olmalı");
    return s;
  },
  get uploadRateLimit() {
    return Number(process.env.UPLOAD_RATE_LIMIT_PER_10MIN) || 400;
  },
};
