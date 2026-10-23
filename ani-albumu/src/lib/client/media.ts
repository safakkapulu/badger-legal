// Tarayıcıda çalışan görsel işlemleri: HEIC → JPEG, küçük önizleme, video kapağı.

export const THUMB_EDGE = 600;
/** iOS Safari'nin canvas alan sınırı (~16.7 MP) altında kalmak için. */
const DISPLAY_EDGE = 4096;

function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Görsel açılamadı"));
    };
    img.src = url;
  });
}

function drawToJpeg(
  source: CanvasImageSource,
  width: number,
  height: number,
  maxEdge: number,
  quality: number,
): Promise<Blob> {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new Error("Canvas kullanılamıyor"));
  ctx.imageSmoothingQuality = "high";
  // Görsel tarayıcı tarafından EXIF yönüne göre döndürülmüş olarak çizilir
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        // iOS'ta bellek hemen geri verilsin
        canvas.width = canvas.height = 0;
        if (b) resolve(b);
        else reject(new Error("JPEG üretilemedi"));
      },
      "image/jpeg",
      quality,
    );
  });
}

async function heicToJpeg(file: Blob): Promise<Blob> {
  // Safari 17+ HEIC'i yerel olarak açabilir; bu, heic2any'den çok daha hızlıdır
  try {
    const img = await loadImage(file);
    return await drawToJpeg(img, img.naturalWidth, img.naturalHeight, DISPLAY_EDGE, 0.9);
  } catch {
    const { default: heic2any } = await import("heic2any");
    const out = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.9 });
    return Array.isArray(out) ? out[0] : out;
  }
}

export type Prepared = { thumb: Blob | null; display: Blob | null };

export async function preparePhoto(file: File, isHeic: boolean): Promise<Prepared> {
  let display: Blob | null = null;
  let source: Blob = file;
  if (isHeic) {
    try {
      display = await heicToJpeg(file);
      source = display;
    } catch (e) {
      console.warn("HEIC dönüştürülemedi", e);
      return { thumb: null, display: null };
    }
  }
  try {
    const img = await loadImage(source);
    const thumb = await drawToJpeg(img, img.naturalWidth, img.naturalHeight, THUMB_EDGE, 0.8);
    return { thumb, display };
  } catch (e) {
    console.warn("Önizleme üretilemedi", e);
    return { thumb: null, display };
  }
}

function once(target: EventTarget, event: string, ms: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} zaman aşımı`)), ms);
    target.addEventListener(
      event,
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

/** Videonun başından bir kare alır. Desteklenmeyen kodeklerde null döner. */
export async function videoPoster(file: File): Promise<Blob | null> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  try {
    video.src = url;
    video.load();
    await once(video, "loadeddata", 8000);
    const t = Math.min(0.5, (video.duration || 1) / 2);
    const seeked = once(video, "seeked", 8000);
    video.currentTime = t;
    await seeked;
    if (!video.videoWidth) return null;
    return await drawToJpeg(video, video.videoWidth, video.videoHeight, THUMB_EDGE, 0.8);
  } catch (e) {
    console.warn("Video kapağı üretilemedi", e);
    return null;
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}
