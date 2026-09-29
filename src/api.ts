import type { Book, Chapter, Session } from "./types";

const sessionKey = "bookfreek.session";

export function readSession(): Session | null {
  const value = localStorage.getItem(sessionKey);
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<Session>;
    if (typeof parsed.userId !== "string" || typeof parsed.username !== "string") throw new Error("Invalid session");
    const session = { userId: parsed.userId, username: parsed.username };
    localStorage.setItem(sessionKey, JSON.stringify(session));
    return session;
  } catch {
    localStorage.removeItem(sessionKey);
    return null;
  }
}

export function saveSession(session: Session | null) {
  if (session) localStorage.setItem(sessionKey, JSON.stringify(session));
  else localStorage.removeItem(sessionKey);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(payload?.error ?? `Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

export async function signIn(username: string, password: string): Promise<Session> {
  const result = await request<Session>("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  saveSession(result);
  return result;
}

export function getBooks(query: string, sort: string): Promise<Book[]> {
  const params = new URLSearchParams({ search: query, sort });
  return request(`/api/books?${params}`);
}

export function getChapters(id: string): Promise<Chapter[]> {
  return request(`/api/books/${encodeURIComponent(id)}/chapters`);
}

export async function saveProgress(id: string, position: number, paused = false) {
  await request(`/api/books/${encodeURIComponent(id)}/progress`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ position, paused }),
  });
}

export function imageUrl(id: string, tag?: string) {
  const params = tag ? `?tag=${encodeURIComponent(tag)}` : "";
  return `/api/books/${encodeURIComponent(id)}/image${params}`;
}

export function audioUrl(id: string) {
  return `/api/books/${encodeURIComponent(id)}/audio`;
}

export async function signOut() {
  await request("/api/auth/logout", { method: "POST" });
  saveSession(null);
}
