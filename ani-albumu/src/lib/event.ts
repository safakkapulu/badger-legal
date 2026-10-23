import "server-only";
import { MB, type Limits } from "./config";

export function getEvent() {
  return {
    title: process.env.EVENT_TITLE || "Şafak & Öykü Nişan Töreni",
    date: process.env.EVENT_DATE || "",
    cover: process.env.EVENT_COVER_IMAGE || "",
  };
}

export function getLimits(): Limits {
  return {
    photoBytes: (Number(process.env.MAX_PHOTO_MB) || 25) * MB,
    videoBytes: (Number(process.env.MAX_VIDEO_MB) || 500) * MB,
  };
}
