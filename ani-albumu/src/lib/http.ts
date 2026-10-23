import "server-only";
import { NextResponse } from "next/server";

export function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function readJson<T>(req: Request): Promise<Partial<T> | null> {
  try {
    const body = await req.json();
    return body && typeof body === "object" ? (body as Partial<T>) : null;
  } catch {
    return null;
  }
}
