"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ACCEPT_ATTR, MB, checkFile, type Limits } from "@/lib/config";
import { UploadError, uploadJob, type Job } from "@/lib/client/upload";

type Status = "bekliyor" | "hazirlaniyor" | "yukleniyor" | "kaydediliyor" | "tamam" | "hata";

type Item = {
  id: string;
  name: string;
  size: number;
  isVideo: boolean;
  status: Status;
  progress: number;
  error?: string;
  retryable?: boolean;
  preview?: string;
};

const NAME_KEY = "aniAlbumu.isim";
const FILE_CONCURRENCY = 2;
const ACTIVE: Status[] = ["bekliyor", "hazirlaniyor", "yukleniyor", "kaydediliyor"];

const STATUS_TEXT: Record<Status, string> = {
  bekliyor: "Sırada",
  hazirlaniyor: "Hazırlanıyor…",
  yukleniyor: "Yükleniyor",
  kaydediliyor: "Kaydediliyor…",
  tamam: "Yüklendi",
  hata: "Yüklenemedi",
};

function formatSize(bytes: number) {
  return bytes >= MB ? `${(bytes / MB).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

let seq = 0;

export function Uploader({ limits }: { limits: Limits }) {
  const [name, setName] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const jobs = useRef(new Map<string, Job>());
  const queue = useRef<string[]>([]);
  const active = useRef(0);
  const previews = useRef(new Map<string, string>());
  const nameRef = useRef("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(NAME_KEY) ?? "";
      nameRef.current = saved;
      setName(saved);
    } catch {
      /* gizli sekme vb. */
    }
  }, []);

  const onName = (value: string) => {
    setName(value);
    nameRef.current = value;
    try {
      localStorage.setItem(NAME_KEY, value);
    } catch {
      /* yoksay */
    }
  };

  const patch = useCallback((id: string, p: Partial<Item>) => {
    setItems((list) => list.map((it) => (it.id === id ? { ...it, ...p } : it)));
  }, []);

  const pump = useCallback(function pumpQueue() {
    while (active.current < FILE_CONCURRENCY && queue.current.length > 0) {
      const id = queue.current.shift()!;
      const job = jobs.current.get(id);
      if (!job) continue;
      active.current++;
      let lastPct = -1;
      uploadJob(job, nameRef.current.trim(), (fraction, phase) => {
        const pct = Math.floor(fraction * 100);
        if (pct === lastPct && phase === "yukleniyor") return;
        lastPct = pct;
        if (job.prepared?.thumb && !previews.current.has(id)) {
          previews.current.set(id, URL.createObjectURL(job.prepared.thumb));
        }
        const preview = previews.current.get(id);
        setItems((list) =>
          list.map((it) =>
            it.id === id
              ? { ...it, status: phase, progress: fraction, preview }
              : it,
          ),
        );
      })
        .then(() => patch(id, { status: "tamam", progress: 1, error: undefined }))
        .catch((e: unknown) => {
          console.error(e);
          const err = e instanceof UploadError ? e : null;
          patch(id, {
            status: "hata",
            error: err?.message ?? "Beklenmeyen bir hata oluştu.",
            retryable: err ? err.retryable : true,
          });
        })
        .finally(() => {
          active.current--;
          pumpQueue();
        });
    }
  }, [patch]);

  const addFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const added: Item[] = [];
    for (const file of Array.from(files)) {
      const id = `f${++seq}`;
      const check = checkFile(file.name, file.type, file.size, limits);
      const isVideo = check.ok ? check.type === "video" : file.type.startsWith("video/");
      if (!check.ok) {
        added.push({ id, name: file.name, size: file.size, isVideo, status: "hata", progress: 0, error: check.error, retryable: false });
        continue;
      }
      jobs.current.set(id, { file });
      queue.current.push(id);
      added.push({ id, name: file.name, size: file.size, isVideo, status: "bekliyor", progress: 0 });
    }
    setItems((list) => [...added.reverse(), ...list]);
    pump();
  };

  const retry = (id: string) => {
    if (!jobs.current.has(id) || queue.current.includes(id)) return;
    patch(id, { status: "bekliyor", error: undefined });
    queue.current.push(id);
    pump();
  };

  const busy = items.some((it) => ACTIVE.includes(it.status));
  const done = items.filter((it) => it.status === "tamam").length;
  const failed = items.filter((it) => it.status === "hata");
  const retryableFailed = failed.filter((it) => it.retryable);

  // Yükleme sürerken ekranın kapanmasını ve sayfadan yanlışlıkla çıkılmasını engelle
  useEffect(() => {
    if (!busy) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const acquire = () => {
      if (document.visibilityState !== "visible" || !("wakeLock" in navigator)) return;
      navigator.wakeLock
        .request("screen")
        .then((l) => {
          if (cancelled) void l.release();
          else lock = l;
        })
        .catch(() => undefined);
    };
    const beforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    acquire();
    document.addEventListener("visibilitychange", acquire);
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      cancelled = true;
      void lock?.release().catch(() => undefined);
      document.removeEventListener("visibilitychange", acquire);
      window.removeEventListener("beforeunload", beforeUnload);
    };
  }, [busy]);

  return (
    <div className="space-y-5">
      <label className="block">
        <span className="mb-1 block text-sm text-black/60">Adınız (isteğe bağlı)</span>
        <input
          type="text"
          value={name}
          onChange={(e) => onName(e.target.value)}
          maxLength={60}
          autoComplete="name"
          placeholder="Örn. Ayşe Teyze"
          className="w-full rounded-xl border border-black/10 bg-white px-4 py-3 text-base outline-none focus:border-gul focus:ring-2 focus:ring-gul/30"
        />
      </label>

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="flex w-full flex-col items-center justify-center gap-2 rounded-2xl bg-murdum px-6 py-8 text-white shadow-lg shadow-murdum/20 transition active:scale-[0.98]"
      >
        <svg viewBox="0 0 24 24" className="h-10 w-10" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden>
          <path d="M3 8.5A2.5 2.5 0 0 1 5.5 6h1.6l1.4-2h7l1.4 2h1.6A2.5 2.5 0 0 1 21 8.5v9a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z" />
          <circle cx="12" cy="13" r="3.5" />
        </svg>
        <span className="text-xl font-semibold">Fotoğraf/Video Yükle</span>
        <span className="text-xs opacity-80">
          Birden fazla seçebilirsiniz · fotoğraf en fazla {Math.round(limits.photoBytes / MB)} MB, video en fazla{" "}
          {Math.round(limits.videoBytes / MB)} MB
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPT_ATTR}
        className="hidden"
        onChange={(e) => {
          addFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {!busy && done > 0 && (
        <div className="rounded-2xl border border-altin/40 bg-white p-5 text-center">
          <p className="font-serif text-xl text-murdum">Teşekkür ederiz! 💐</p>
          <p className="mt-1 text-sm text-black/60">
            {done} dosya anı albümümüze eklendi.
            {failed.length > 0 && ` ${failed.length} dosya yüklenemedi.`}
          </p>
          <Link
            href="/galeri"
            className="mt-4 inline-block rounded-full bg-gul px-6 py-2.5 text-sm font-semibold text-white"
          >
            Galeriyi gör
          </Link>
        </div>
      )}

      {retryableFailed.length > 1 && (
        <button
          type="button"
          onClick={() => retryableFailed.forEach((it) => retry(it.id))}
          className="w-full rounded-xl border border-gul px-4 py-2.5 text-sm font-semibold text-gul"
        >
          Yüklenemeyenlerin hepsini tekrar dene ({retryableFailed.length})
        </button>
      )}

      {items.length > 0 && (
        <ul className="space-y-2">
          {items.map((it) => (
            <li key={it.id} className="flex items-center gap-3 rounded-xl bg-white p-3 shadow-sm">
              <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-krem">
                {it.preview ? (
                  // eslint-disable-next-line @next/next/no-img-element -- yerel blob önizlemesi
                  <img src={it.preview} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-full items-center justify-center text-xl" aria-hidden>
                    {it.isVideo ? "🎬" : "🖼️"}
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate text-sm">{it.name}</p>
                  <p className="shrink-0 text-xs text-black/50">{formatSize(it.size)}</p>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-black/5">
                  <div
                    className={`h-full rounded-full transition-[width] ${
                      it.status === "hata" ? "bg-red-400" : it.status === "tamam" ? "bg-emerald-500" : "bg-gul"
                    }`}
                    style={{ width: `${Math.round((it.status === "hata" ? Math.max(it.progress, 0.04) : it.progress) * 100)}%` }}
                  />
                </div>
                <div className="mt-1 flex items-center justify-between gap-2 text-xs">
                  <span className={it.status === "hata" ? "text-red-600" : "text-black/50"}>
                    {it.status === "hata" ? it.error : STATUS_TEXT[it.status]}
                    {it.status === "yukleniyor" && ` %${Math.round(it.progress * 100)}`}
                  </span>
                  {it.status === "hata" && it.retryable && (
                    <button type="button" onClick={() => retry(it.id)} className="shrink-0 font-semibold text-gul">
                      Tekrar dene
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
