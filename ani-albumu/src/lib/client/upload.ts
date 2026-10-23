// Dosyaları presigned URL'lerle doğrudan R2'ye yükleyen istemci motoru.
// Zayıf bağlantı için: her istek kendi içinde tekrar denenir, multipart yüklemede
// tamamlanan parçalar hatırlanır ve "Tekrar dene" kaldığı yerden devam eder.

import { extOf } from "../config";
import { preparePhoto, videoPoster, type Prepared } from "./media";

type StartResponse = {
  token: string;
  contentType: string;
  url: string | null;
  multipart: { partSize: number; partCount: number } | null;
  thumbUrl: string | null;
  displayUrl: string | null;
};

type SignResponse = {
  parts: Record<number, string>;
  url: string | null;
  thumbUrl: string | null;
  displayUrl: string | null;
};

/** Bir dosyanın yükleme durumu; hata sonrası tekrar denemede yeniden kullanılır. */
export type UploadSession = {
  start: StartResponse;
  signedAt: number;
  thumbDone: boolean;
  displayDone: boolean;
  mainDone: boolean;
  etags: Record<number, string>;
};

export class UploadError extends Error {
  constructor(
    message: string,
    /** false ise tekrar denemek anlamsızdır (ör. dosya türü reddedildi). */
    readonly retryable = true,
    readonly status = 0,
  ) {
    super(message);
  }
}

class HttpError extends Error {
  constructor(readonly status: number) {
    super(`HTTP ${status}`);
  }
}

const URL_MAX_AGE = 45 * 60 * 1000; // sunucu URL'leri 1 saat geçerli; güvenli pay bırak
const PART_CONCURRENCY = 3;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitOnline() {
  if (typeof navigator === "undefined" || navigator.onLine) return;
  await new Promise<void>((resolve) => {
    const done = () => {
      window.removeEventListener("online", done);
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(done, 60_000);
    window.addEventListener("online", done);
  });
}

async function withRetry<T>(fn: (attempt: number) => Promise<T>, attempts = 4): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn(i);
    } catch (e) {
      last = e;
      // 4xx (süre dolması 403 hariç) tekrar denemekle düzelmez
      if (e instanceof HttpError && e.status >= 400 && e.status < 500 && e.status !== 403 && e.status !== 408) break;
      if (e instanceof UploadError && !e.retryable) break;
      if (i < attempts - 1) {
        await waitOnline();
        await sleep(1000 * 2 ** i + Math.random() * 500);
      }
    }
  }
  throw last;
}

async function api<T>(path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw new UploadError("Bağlantı kurulamadı.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = typeof data.error === "string" ? data.error : "Sunucu hatası.";
    // 401: oturum süresi doldu → yeniden başlatılabilir; 400/413/415: kalıcı hata
    throw new UploadError(
      msg,
      res.status >= 500 || res.status === 429 || res.status === 401 || res.status === 409,
      res.status,
    );
  }
  return data as T;
}

function put(
  url: string,
  body: Blob,
  contentType: string | null,
  onProgress: (loaded: number) => void,
): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    if (contentType) xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (e) => onProgress(e.loaded);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(body.size);
        resolve(xhr.getResponseHeader("ETag"));
      } else {
        onProgress(0);
        reject(new HttpError(xhr.status));
      }
    };
    xhr.onerror = xhr.ontimeout = () => {
      onProgress(0);
      reject(new UploadError("Ağ hatası."));
    };
    // 8 MB'lık parça için yavaş bağlantıda bile yeterli
    xhr.timeout = 5 * 60 * 1000;
    xhr.send(body);
  });
}

export type Job = {
  file: File;
  prepared?: Prepared;
  session?: UploadSession;
};

export type ProgressFn = (fraction: number, phase: "hazirlaniyor" | "yukleniyor" | "kaydediliyor") => void;

let prepareLock: Promise<unknown> = Promise.resolve();

/** HEIC dönüşümü bellek açısından ağır; telefonlarda aynı anda tek dosya işlenir. */
function prepare(file: File): Promise<Prepared> {
  const ext = extOf(file.name);
  const isVideo = ext === "mp4" || ext === "mov";
  const run = () =>
    isVideo
      ? videoPoster(file).then((thumb) => ({ thumb, display: null }))
      : preparePhoto(file, ext === "heic" || ext === "heif");
  const p = prepareLock.then(run, run);
  prepareLock = p.catch(() => undefined);
  return p;
}

export async function uploadJob(job: Job, uploaderName: string, onProgress: ProgressFn): Promise<void> {
  const { file } = job;

  if (!job.prepared) {
    onProgress(0, "hazirlaniyor");
    job.prepared = await prepare(file);
  }
  const { thumb, display } = job.prepared;

  if (!job.session) {
    const start = await withRetry(
      () =>
        api<StartResponse>("/api/upload/start", {
          name: file.name,
          size: file.size,
          mime: file.type,
          withThumb: !!thumb,
          withDisplay: !!display,
        }),
      3,
    );
    job.session = { start, signedAt: Date.now(), thumbDone: false, displayDone: false, mainDone: false, etags: {} };
  }
  const s = job.session;
  const st = s.start;

  // Tekrar denemede eski imzalı URL'lerin süresi dolmuş olabilir
  const refresh = async () => {
    if (Date.now() - s.signedAt < URL_MAX_AGE) return;
    const fresh = await withRetry(
      () =>
        api<SignResponse>("/api/upload/sign", {
          token: st.token,
          main: !s.mainDone,
          thumb: !s.thumbDone,
          display: !s.displayDone,
        }),
      3,
    );
    st.url = fresh.url ?? st.url;
    st.thumbUrl = fresh.thumbUrl ?? st.thumbUrl;
    st.displayUrl = fresh.displayUrl ?? st.displayUrl;
    s.signedAt = Date.now();
  };

  const extra = (thumb && st.thumbUrl ? thumb.size : 0) + (display && st.displayUrl ? display.size : 0);
  const total = file.size + extra;
  let doneBytes = (s.thumbDone && thumb ? thumb.size : 0) + (s.displayDone && display ? display.size : 0);
  const inflight = new Map<string, number>();
  const report = () => {
    let sum = doneBytes;
    for (const v of inflight.values()) sum += v;
    onProgress(Math.min(1, sum / total), "yukleniyor");
  };
  const track = (id: string) => (loaded: number) => {
    inflight.set(id, loaded);
    report();
  };
  const finish = (id: string, size: number) => {
    inflight.delete(id);
    doneBytes += size;
    report();
  };

  await refresh();

  // Küçük dosyalar önce: önizleme hızlıca hazır olsun
  if (thumb && st.thumbUrl && !s.thumbDone) {
    await withRetry(async () => {
      await refresh();
      await put(st.thumbUrl!, thumb, "image/jpeg", track("thumb"));
    });
    s.thumbDone = true;
    finish("thumb", thumb.size);
  }
  if (display && st.displayUrl && !s.displayDone) {
    await withRetry(async () => {
      await refresh();
      await put(st.displayUrl!, display, "image/jpeg", track("display"));
    });
    s.displayDone = true;
    finish("display", display.size);
  }

  if (!s.mainDone) {
    if (st.multipart) {
      await uploadParts(file, s, track, finish);
    } else {
      await withRetry(async () => {
        await refresh();
        await put(st.url!, file, st.contentType, track("main"));
      });
      finish("main", file.size);
    }
    s.mainDone = true;
  } else {
    doneBytes += file.size;
  }

  onProgress(1, "kaydediliyor");
  const parts = st.multipart
    ? Object.entries(s.etags).map(([n, ETag]) => ({ PartNumber: Number(n), ETag }))
    : [];
  try {
    await withRetry(() => api("/api/upload/complete", { token: st.token, parts, uploaderName }), 4);
  } catch (e) {
    // Oturum süresi dolduysa ya da dosya depoda yoksa baştan yüklemek gerekir
    if (e instanceof UploadError && (e.status === 401 || e.status === 409)) job.session = undefined;
    throw e;
  }
}

async function uploadParts(
  file: File,
  s: UploadSession,
  track: (id: string) => (loaded: number) => void,
  finish: (id: string, size: number) => void,
) {
  const { partSize, partCount } = s.start.multipart!;
  const pending: number[] = [];
  for (let n = 1; n <= partCount; n++) {
    const size = Math.min(partSize, file.size - (n - 1) * partSize);
    if (s.etags[n]) finish(`p${n}`, size);
    else pending.push(n);
  }

  const urls = new Map<number, { url: string; at: number }>();
  const signParts = async (nums: number[]) => {
    const res = await withRetry(() => api<SignResponse>("/api/upload/sign", { token: s.start.token, parts: nums }), 3);
    const at = Date.now();
    for (const [n, url] of Object.entries(res.parts)) urls.set(Number(n), { url, at });
  };
  const urlFor = async (n: number, forceFresh: boolean) => {
    const cached = urls.get(n);
    if (!forceFresh && cached && Date.now() - cached.at < URL_MAX_AGE) return cached.url;
    // Bir sonraki birkaç parçayı da aynı istekte imzalat
    const batch = [n, ...pending.filter((p) => p > n && !urls.has(p)).slice(0, 9)];
    await signParts(batch);
    return urls.get(n)!.url;
  };

  let next = 0;
  let failed = false;
  const worker = async () => {
    while (!failed && next < pending.length) {
      const n = pending[next++];
      const blob = file.slice((n - 1) * partSize, Math.min(n * partSize, file.size));
      const etag = await withRetry(async (attempt) => {
        if (failed) throw new UploadError("İptal edildi.");
        const url = await urlFor(n, attempt > 0);
        const tag = await put(url, blob, null, track(`p${n}`));
        if (!tag) throw new UploadError("Depolama ETag başlığını göstermiyor (R2 CORS ayarına ETag ekleyin).", false);
        return tag;
      }, 6);
      s.etags[n] = etag;
      finish(`p${n}`, blob.size);
    }
  };
  // Bir parça kalıcı olarak başarısız olursa diğer işçiler yeni parça almaz; hepsi
  // durmadan hata fırlatılmaz ki "Tekrar dene" eski işçilerle çakışmasın.
  const results = await Promise.allSettled(
    Array.from({ length: Math.min(PART_CONCURRENCY, pending.length) }, () =>
      worker().catch((e) => {
        failed = true;
        throw e;
      }),
    ),
  );
  const rejected = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
  if (rejected) throw rejected.reason;
}
