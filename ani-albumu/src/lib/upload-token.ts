import type { MediaType } from "./config";

/** /api/upload/start tarafından imzalanıp istemciye verilen yükleme bilgisi. */
export type UploadTicket = {
  id: string;
  name: string;
  ext: string;
  type: MediaType;
  size: number;
  contentType: string;
  key: string;
  thumbKey: string | null;
  displayKey: string | null;
  uploadId: string | null;
  partCount: number | null;
};

export const UPLOAD_PURPOSE = "upload";
export const UPLOAD_TICKET_TTL = 6 * 60 * 60; // zayıf bağlantıda uzun süren yüklemeler için 6 saat
