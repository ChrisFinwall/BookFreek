import dotenv from "dotenv";
import express, { type NextFunction, type Request, type Response } from "express";
import { parseFile } from "music-metadata";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseSidecar } from "./chapters.js";

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 3001);
const jellyfinUrl = process.env.JELLYFIN_URL?.replace(/\/+$/, "");
const mediaRoot = process.env.MEDIA_ROOT ? path.resolve(process.env.MEDIA_ROOT) : null;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.use(express.json({ limit: "32kb" }));

interface AuthenticatedRequest extends Request {
  jellyfinToken?: string;
}

interface JellyfinUser {
  Id: string;
  Name: string;
  AccessToken: string;
}

interface JellyfinItem {
  Id: string;
  Name: string;
  Album?: string;
  AlbumArtist?: string;
  Artists?: string[];
  ProductionYear?: number;
  Overview?: string;
  RunTimeTicks?: number;
  ImageTags?: { Primary?: string };
  UserData?: { PlaybackPositionTicks?: number; Played?: boolean };
  Path?: string;
  Chapters?: Array<{ Name?: string; StartPositionTicks: number }>;
}

function jellyfin(pathname: string, token?: string) {
  if (!jellyfinUrl) throw new Error("JELLYFIN_URL is not configured on the companion service.");
  return fetch(`${jellyfinUrl}${pathname}`, {
    headers: token ? { "X-Emby-Token": token, "Content-Type": "application/json" } : { "Content-Type": "application/json" },
  });
}

function auth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const header = req.header("authorization");
  const cookieToken = sessionToken(req);
  const token = header?.startsWith("Bearer ") ? header.slice(7) : cookieToken;
  if (!token) {
    res.status(401).json({ error: "Sign in to Jellyfin to continue." });
    return;
  }
  req.jellyfinToken = token;
  next();
}

function sessionToken(req: Request) {
  const cookie = req.header("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith("bookfreek_token="));
  if (!cookie) return "";
  try {
    return decodeURIComponent(cookie.slice("bookfreek_token=".length));
  } catch {
    return "";
  }
}

function setSessionCookie(res: Response, token?: string) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("Set-Cookie", token
    ? `bookfreek_token=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=604800${secure}`
    : `bookfreek_token=; HttpOnly; SameSite=Strict; Path=/api; Max-Age=0${secure}`);
}

function requireJellyfinConfig(res: Response) {
  if (jellyfinUrl) return true;
  res.status(503).json({ error: "JELLYFIN_URL is not configured. Set it in the companion service environment and restart." });
  return false;
}

async function getItem(id: string, token: string): Promise<JellyfinItem> {
  const response = await jellyfin(`/Items/${encodeURIComponent(id)}?Fields=Path,Chapters,MediaSources,Overview,Genres,People,UserData`, token);
  if (!response.ok) throw new Error(`Jellyfin item lookup failed (${response.status}).`);
  return response.json() as Promise<JellyfinItem>;
}

function insideMediaRoot(mediaPath: string) {
  if (!mediaRoot) return null;
  const absolute = path.resolve(mediaPath);
  const relative = path.relative(mediaRoot, absolute);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return null;
  return absolute;
}

app.get("/api/config", (_req, res) => {
  res.json({ configured: Boolean(jellyfinUrl) });
});

app.post("/api/auth/login", async (req, res) => {
  if (!requireJellyfinConfig(res)) return;
  const { username, password } = req.body as { username?: unknown; password?: unknown };
  if (typeof username !== "string" || typeof password !== "string" || !username || !password) {
    res.status(400).json({ error: "Enter your Jellyfin username and password." });
    return;
  }
  try {
    const response = await fetch(`${jellyfinUrl}/Users/AuthenticateByName`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Emby-Authorization": 'MediaBrowser Client="BookFreek", Device="Web", DeviceId="bookfreek-web", Version="0.1.0"',
      },
      body: JSON.stringify({ Username: username, Pw: password }),
    });
    if (!response.ok) {
      res.status(response.status === 401 ? 401 : 502).json({ error: response.status === 401 ? "Jellyfin username or password is incorrect." : `Jellyfin sign-in failed (${response.status}).` });
      return;
    }
    const user = await response.json() as JellyfinUser;
    setSessionCookie(res, user.AccessToken);
    res.json({ userId: user.Id, username: user.Name });
  } catch (error) {
    console.error("Jellyfin sign-in failed:", error);
    res.status(502).json({ error: "Could not reach Jellyfin. Check the configured server URL." });
  }
});

app.post("/api/auth/logout", (_req, res) => {
  setSessionCookie(res);
  res.json({ signedOut: true });
});

app.get("/api/books", auth, async (req: AuthenticatedRequest, res) => {
  if (!requireJellyfinConfig(res)) return;
  try {
    const userResponse = await jellyfin("/Users/Me", req.jellyfinToken);
    if (!userResponse.ok) {
      res.status(userResponse.status).json({ error: `Jellyfin user lookup failed (${userResponse.status}).` });
      return;
    }
    const user = await userResponse.json() as { Id: string };
    const params = new URLSearchParams({
      Recursive: "true",
      IncludeItemTypes: "Audio,Book",
      Fields: "Path,Overview,Genres,People,UserData,DateCreated",
      EnableUserData: "true",
      SortBy: req.query.sort === "recent" ? "DateCreated,SortName" : req.query.sort === "year" ? "ProductionYear,SortName" : "SortName",
      SortOrder: req.query.sort === "year" ? "Descending" : "Ascending",
      Limit: "500",
    });
    if (req.query.search) params.set("SearchTerm", String(req.query.search).slice(0, 200));
    const response = await jellyfin(`/Users/${encodeURIComponent(user.Id)}/Items?${params}`, req.jellyfinToken);
    if (!response.ok) {
      res.status(response.status).json({ error: `Jellyfin library request failed (${response.status}).` });
      return;
    }
    const payload = await response.json() as { Items?: JellyfinItem[] };
    res.json(payload.Items ?? []);
  } catch (error) {
    console.error("Jellyfin library request failed:", error);
    res.status(502).json({ error: error instanceof Error ? error.message : "Could not load the Jellyfin library." });
  }
});

app.get("/api/books/:id/chapters", auth, async (req: AuthenticatedRequest, res) => {
  if (!requireJellyfinConfig(res)) return;
  try {
    const item = await getItem(req.params.id, req.jellyfinToken!);
    if (mediaRoot && item.Path) {
      const audioPath = insideMediaRoot(item.Path);
      if (!audioPath) {
        console.warn(`Jellyfin path for ${item.Id} is outside MEDIA_ROOT; using Jellyfin chapters.`);
      } else {
        const sidecarPath = `${audioPath}.chapters.json`;
        try {
          const { readFile } = await import("node:fs/promises");
          const data = JSON.parse(await readFile(sidecarPath, "utf8")) as unknown;
          res.json(parseSidecar(data));
          return;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
            console.warn(`Could not read chapter sidecar ${sidecarPath}:`, error);
          }
        }
        try {
          const metadata = await parseFile(audioPath, { duration: true });
          const embedded = metadata.common.chapters ?? [];
          if (embedded.length) {
            res.json(embedded.map((chapter) => ({ title: chapter.title, start: chapter.startTime, end: chapter.endTime })));
            return;
          }
        } catch (error) {
          console.warn(`Could not parse embedded chapters for ${item.Id}:`, error);
        }
      }
    }
    res.json((item.Chapters ?? []).map((chapter, index) => ({
      title: chapter.Name || `Chapter ${index + 1}`,
      start: chapter.StartPositionTicks / 10_000_000,
    })));
  } catch (error) {
    console.error("Chapter lookup failed:", error);
    res.status(502).json({ error: error instanceof Error ? error.message : "Could not load audiobook chapters." });
  }
});

app.post("/api/books/:id/progress", auth, async (req: AuthenticatedRequest, res) => {
  if (!requireJellyfinConfig(res)) return;
  const position = Number((req.body as { position?: unknown }).position);
  const paused = Boolean((req.body as { paused?: unknown }).paused);
  if (!Number.isFinite(position) || position < 0) {
    res.status(400).json({ error: "Playback position must be a non-negative number." });
    return;
  }
  try {
    const userResponse = await jellyfin("/Users/Me", req.jellyfinToken);
    if (!userResponse.ok) {
      res.status(userResponse.status).json({ error: `Jellyfin user lookup failed (${userResponse.status}).` });
      return;
    }
    const user = await userResponse.json() as { Id: string };
    const response = await fetch(`${jellyfinUrl}/Sessions/Playing/Progress?${new URLSearchParams({
      ItemId: req.params.id,
      UserId: user.Id,
      PositionTicks: String(Math.floor(position * 10_000_000)),
      IsPaused: String(paused),
      PlayMethod: "DirectStream",
    })}`, {
      method: "POST",
      headers: { "X-Emby-Token": req.jellyfinToken! },
    });
    if (!response.ok) {
      res.status(response.status).json({ error: `Could not save Jellyfin playback progress (${response.status}).` });
      return;
    }
    res.json({ saved: true });
  } catch (error) {
    console.error("Playback progress update failed:", error);
    res.status(502).json({ error: "Could not save Jellyfin playback progress." });
  }
});

app.get("/api/books/:id/image", auth, async (req: AuthenticatedRequest, res) => {
  if (!requireJellyfinConfig(res)) return;
  try {
    const tag = typeof req.query.tag === "string" ? `?tag=${encodeURIComponent(req.query.tag)}` : "";
    const response = await jellyfin(`/Items/${encodeURIComponent(req.params.id)}/Images/Primary${tag}`, req.jellyfinToken);
    if (!response.ok) {
      res.status(response.status).end();
      return;
    }
    res.set("Content-Type", response.headers.get("content-type") || "image/jpeg");
    res.set("Cache-Control", "private, max-age=3600");
    if (response.body) res.send(Buffer.from(await response.arrayBuffer()));
    else res.status(502).end();
  } catch (error) {
    console.error("Artwork proxy failed:", error);
    res.status(502).json({ error: "Could not load audiobook artwork." });
  }
});

app.get("/api/books/:id/audio", async (req, res) => {
  if (!requireJellyfinConfig(res)) return;
  const token = sessionToken(req);
  if (!token) {
    res.status(401).json({ error: "Sign in to Jellyfin to play audiobooks." });
    return;
  }
  try {
    const userResponse = await jellyfin("/Users/Me", token);
    if (!userResponse.ok) {
      res.status(userResponse.status).json({ error: `Jellyfin user lookup failed (${userResponse.status}).` });
      return;
    }
    const user = await userResponse.json() as { Id: string };
    const headers: Record<string, string> = { "X-Emby-Token": token };
    const range = req.header("range");
    if (range) headers.Range = range;
    const response = await fetch(`${jellyfinUrl}/Audio/${encodeURIComponent(req.params.id)}/universal?UserId=${encodeURIComponent(user.Id)}&DeviceId=bookfreek-web`, {
      headers,
    });
    if (!response.ok && response.status !== 206) {
      res.status(response.status).json({ error: `Jellyfin audio request failed (${response.status}).` });
      return;
    }
    res.status(response.status);
    for (const name of ["content-type", "content-length", "content-range", "accept-ranges"]) {
      const value = response.headers.get(name);
      if (value) res.set(name, value);
    }
    if (response.body) {
      const reader = response.body.getReader();
      res.on("close", () => void reader.cancel());
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!res.write(value)) await new Promise<void>((resolve) => res.once("drain", resolve));
      }
      res.end();
    } else {
      res.end();
    }
  } catch (error) {
    console.error("Audio proxy failed:", error);
    if (!res.headersSent) res.status(502).json({ error: "Could not stream this audiobook from Jellyfin." });
  }
});

if (process.env.NODE_ENV === "production") {
  const clientDist = path.resolve(__dirname, "../dist");
  app.use(express.static(clientDist));
  app.get("*", (_req, res) => res.sendFile(path.join(clientDist, "index.html")));
}

app.listen(port, "0.0.0.0", () => {
  console.log(`BookFreek companion service listening on port ${port}`);
  if (!jellyfinUrl) console.warn("JELLYFIN_URL is not configured. Copy .env.example to .env and set the server URL.");
  if (!mediaRoot) console.warn("MEDIA_ROOT is not configured. Chapter extraction will use Jellyfin item metadata only.");
});
