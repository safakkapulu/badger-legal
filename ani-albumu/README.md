# Anı Albümü — QR kodlu dijital nişan albümü

Misafirler masadaki QR kodu okutur, üye olmadan fotoğraf/video yükler; dosyalar
tarayıcıdan **doğrudan** Cloudflare R2'ye gider (sunucudan geçmez).

- Next.js 16 (App Router, TypeScript) + Tailwind CSS 4
- Dosyalar: Cloudflare R2 (S3 uyumlu SDK, presigned URL)
- Metadata: Turso (libSQL/SQLite)
- Barındırma: Vercel

> Durum: **1. adım** — proje iskeleti ve yükleme akışı. Galeri, admin ve scriptler sonraki adımlarda.

## 1. Cloudflare R2

1. Cloudflare panelinde **R2 → Create bucket** → ad: `ani-albumu`. Bucket **public olmamalı**
   (Public access / r2.dev erişimini açmayın).
2. **R2 → Manage R2 API Tokens → Create API token**: izin *Object Read & Write*, yalnızca bu bucket.
   Çıkan `Access Key ID`, `Secret Access Key` ve hesap kimliğini (`Account ID`) `.env`'ye yazın.
3. Bucket → **Settings → CORS policy** → aşağıdakini yapıştırın (alan adlarını kendinizinkiyle değiştirin):

```json
[
  {
    "AllowedOrigins": ["https://ani-albumu.vercel.app", "http://localhost:3000"],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["content-type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

   `ExposeHeaders: ETag` **zorunludur**; olmazsa 50 MB üstü videolar (multipart) tamamlanamaz.

4. Bucket → **Settings → Object lifecycle rules → Add rule**: *Abort incomplete multipart uploads* → 1 gün.
   (Yarıda bırakılan video yüklemelerinin parçaları depoda yer kaplamasın.)

## 2. Veritabanı (Turso)

```bash
# https://docs.turso.tech/cli/installation
turso auth signup            # ya da: turso auth login
turso db create ani-albumu
turso db show ani-albumu --url        # → TURSO_DATABASE_URL
turso db tokens create ani-albumu     # → TURSO_AUTH_TOKEN
```

Sonra tabloları oluşturun:

```bash
npm install
cp .env.example .env    # değerleri doldurun
npm run db:init
```

Yerelde hızlı deneme için Turso hesabı gerekmez: `TURSO_DATABASE_URL="file:yerel.db"`.

### Tablo

`media(id, r2_key, thumb_key, display_key, type, content_type, original_name, size_bytes, uploader_name, created_at, hidden)`

İstenen şemaya ek olarak: `display_key` (HEIC'ten çevrilen JPEG), `content_type`, `original_name`
(toplu indirmede dosya adı için) ve `size_bytes` (admin panelindeki toplam alan için).

## 3. Yerelde çalıştırma

```bash
npm run dev     # http://localhost:3000
```

Telefondan denemek için bilgisayarla aynı Wi-Fi'da `http://<bilgisayar-ip>:3000` adresini açın ve
bu adresi R2 CORS `AllowedOrigins` listesine ekleyin.

## Nasıl çalışır (yükleme)

1. Tarayıcı dosyayı kontrol eder (uzantı + MIME + boyut), HEIC ise JPEG'e çevirir (Safari'de yerel,
   diğerlerinde `heic2any`), fotoğraflar ve videolar için ~600 px önizleme üretir.
2. `POST /api/upload/start` → sunucu türü/boyutu doğrular, IP başına hız sınırını uygular ve kısa
   süreli imzalı PUT URL'leri ile **imzalı bir yükleme bileti** döner.
3. 50 MB üstü dosyalar 8 MB'lık parçalarla (multipart, 3 paralel) yüklenir. Her parça kendi içinde
   6 kez tekrar denenir; "Tekrar dene" yalnızca eksik parçaları gönderir.
4. `POST /api/upload/complete` → sunucu dosyanın R2'de olduğunu, boyutunu ve **ilk baytlarından gerçek
   türünü** doğrular, sonra veritabanına yazar. Tutmayan dosya silinir.

R2 anahtar düzeni: `medya/<id>/orijinal.<uzantı>`, `medya/<id>/onizleme.jpg`, `medya/<id>/foto.jpg` (yalnızca HEIC).
