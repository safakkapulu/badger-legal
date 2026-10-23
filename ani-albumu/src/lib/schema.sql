CREATE TABLE IF NOT EXISTS media (
  id            TEXT PRIMARY KEY,
  r2_key        TEXT NOT NULL,          -- orijinal dosya
  thumb_key     TEXT,                   -- ~600px JPEG önizleme
  display_key   TEXT,                   -- HEIC'ten çevrilmiş JPEG (yalnızca HEIC için)
  type          TEXT NOT NULL CHECK (type IN ('photo', 'video')),
  content_type  TEXT NOT NULL,
  original_name TEXT NOT NULL,
  size_bytes    INTEGER NOT NULL,       -- orijinal + önizleme + JPEG toplamı
  uploader_name TEXT,
  created_at    INTEGER NOT NULL,       -- Unix zaman damgası (ms)
  hidden        INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS media_visible_created ON media (hidden, created_at DESC);

CREATE TABLE IF NOT EXISTS rate_limits (
  key          TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count        INTEGER NOT NULL
);
