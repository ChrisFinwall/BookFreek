import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { audioUrl, getBooks, getChapters, imageUrl, readServerUrl, readSession, saveProgress, saveSession, signOut as signOutRequest, signIn } from "./api";
import type { Book, Chapter, Session } from "./types";

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = Math.floor(seconds % 60).toString().padStart(2, "0");
  return hours ? `${hours}:${minutes.toString().padStart(2, "0")}:${remainder}` : `${minutes}:${remainder}`;
}

function coverUrl(book: Book) {
  return imageUrl(book.Id, book.ImageTags?.Primary);
}

function App() {
  const [session, setSession] = useState<Session | null>(() => readSession());
  const [books, setBooks] = useState<Book[]>([]);
  const [selected, setSelected] = useState<Book | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("title");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [serverUrl, setServerUrl] = useState(() => readServerUrl());
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const saveTimer = useRef<number | undefined>(undefined);

  const refreshBooks = useCallback(async (search = query, order = sort) => {
    setLoading(true);
    setError("");
    try {
      setBooks(await getBooks(search, order));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load your library.");
    } finally {
      setLoading(false);
    }
  }, [query, sort]);

  useEffect(() => {
    if (!session) return;
    const timer = window.setTimeout(() => void refreshBooks(query, sort), 250);
    return () => window.clearTimeout(timer);
  }, [query, sort, session, refreshBooks]);

  useEffect(() => {
    if (!session || !selected) {
      setChapters([]);
      return;
    }
    let cancelled = false;
    void getChapters(selected.Id).then((result) => {
      if (!cancelled) setChapters(result);
    }).catch((reason: unknown) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : "Unable to load chapters.");
    });
    return () => { cancelled = true; };
  }, [session, selected]);

  useEffect(() => () => window.clearTimeout(saveTimer.current), []);

  const currentIndex = useMemo(
    () => chapters.findIndex((chapter, index) => chapter.start <= currentTime && (index === chapters.length - 1 || chapters[index + 1].start > currentTime)),
    [chapters, currentTime],
  );

  function selectBook(book: Book) {
    setSelected(book);
    setCurrentTime(0);
    setDuration(0);
    setPlaying(false);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = audioUrl(book.Id);
      audioRef.current.load();
    }
  }

  async function togglePlayback() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      try {
        await audio.play();
        setPlaying(true);
      } catch {
        setError("Playback could not start. Check the Jellyfin server and audio format.");
      }
    } else {
      audio.pause();
      setPlaying(false);
    }
  }

  function seekTo(seconds: number) {
    if (audioRef.current) audioRef.current.currentTime = seconds;
  }

  function onTimeUpdate() {
    const audio = audioRef.current;
    if (!audio || !session || !selected) return;
    setCurrentTime(audio.currentTime);
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      void saveProgress(selected.Id, audio.currentTime).catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : "Unable to save playback progress.");
      });
    }, 3000);
  }

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      setSession(await signIn(serverUrl, username, password));
      setPassword("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Sign in failed.");
    } finally {
      setLoading(false);
    }
  }

  function signOut() {
    audioRef.current?.pause();
    saveSession(null);
    void signOutRequest().catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : "Could not sign out.");
    });
    setSession(null);
    setBooks([]);
    setSelected(null);
  }

  if (!session) {
    return (
      <main className="login-page">
        <section className="login-card">
          <Brand />
          <p className="eyebrow">YOUR PERSONAL LISTENING SHELF</p>
          <h1>A good story<br />is always close.</h1>
          <p className="muted">Connect to your Jellyfin server to find and play your audiobooks.</p>
          <form onSubmit={(event) => void handleLogin(event)} className="login-form">
            <label>Jellyfin server address<input type="url" inputMode="url" autoComplete="url" placeholder="http://192.168.1.20:8096" value={serverUrl} onChange={(event) => setServerUrl(event.target.value)} required /></label>
            <label>Jellyfin username<input autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} required /></label>
            <label>Password<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
            {error && <p className="error" role="alert">{error}</p>}
            <button className="primary-button" disabled={loading}>{loading ? "Connecting…" : "Connect to Jellyfin"}</button>
          </form>
          <p className="fine-print">Use the server address reachable from BookFreek, including its port if needed.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <Brand />
        <div className="account"><span>Listening as {session.username}</span><button className="text-button" onClick={signOut}>Sign out</button></div>
      </header>
      <section className="library-head">
        <div>
          <p className="eyebrow">YOUR JELLYFIN LIBRARY</p>
          <h1>Find your next<br className="mobile-break" /> <em>great listen.</em></h1>
        </div>
        <label className="search-box" aria-label="Search audiobooks">
          <span aria-hidden="true">⌕</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search your shelf" />
          <select aria-label="Sort audiobooks" value={sort} onChange={(event) => setSort(event.target.value)}>
            <option value="title">A–Z</option>
            <option value="recent">Recently added</option>
            <option value="year">Year</option>
          </select>
        </label>
      </section>

      {error && <div className="notice" role="alert"><span>{error}</span><button onClick={() => setError("")} aria-label="Dismiss">×</button></div>}
      {loading && books.length === 0 && <p className="empty-state">Finding your audiobooks…</p>}
      {!loading && books.length === 0 && <div className="empty-state"><span className="empty-icon">▤</span><h2>Your shelf is waiting</h2><p>No audiobooks found. Check your Jellyfin library and refresh.</p>      <button className="outline-button" onClick={() => void refreshBooks()}>Refresh library</button></div>}

      <section className="book-grid" aria-label="Audiobook library">
        {books.map((book, index) => (
          <button className={`book-card ${selected?.Id === book.Id ? "selected" : ""}`} key={book.Id} onClick={() => selectBook(book)} style={{ animationDelay: `${Math.min(index, 12) * 35}ms` }}>
            <div className="cover-wrap">
              <img src={coverUrl(book)} alt="" loading="lazy" onError={(event) => { event.currentTarget.style.visibility = "hidden"; }} />
              <span className="cover-placeholder" aria-hidden="true">BF</span>
              {book.UserData?.PlaybackPositionTicks ? <span className="resume-badge">IN PROGRESS</span> : null}
            </div>
            <span className="book-title">{book.Album || book.Name}</span>
            <span className="book-author">{book.AlbumArtist || book.Artists?.join(", ") || "Unknown author"}</span>
          </button>
        ))}
      </section>

      {selected && (
        <section className="player" aria-label="Audiobook player">
          <button className="player-cover" onClick={() => seekTo(0)} aria-label="Restart this audiobook">
            <img src={coverUrl(selected)} alt="" onError={(event) => { event.currentTarget.style.visibility = "hidden"; }} />
            <span className="cover-placeholder">BF</span>
          </button>
          <div className="player-info">
            <span className="eyebrow">NOW LISTENING</span>
            <strong>{selected.Album || selected.Name}</strong>
            <span className="player-author">{selected.AlbumArtist || selected.Artists?.join(", ") || "Unknown author"}</span>
            {chapters.length > 0 && <span className="now-chapter">{chapters[currentIndex]?.title ?? "Ready to play"}</span>}
          </div>
          <div className="player-controls">
            <div className="scrubber">
              <input type="range" min="0" max={duration || 0} step="1" value={Math.min(currentTime, duration || 0)} onChange={(event) => seekTo(Number(event.target.value))} aria-label="Playback position" />
              <div className="time-row"><span>{formatTime(currentTime)}</span><span>{formatTime(duration)}</span></div>
            </div>
            <div className="control-buttons">
              <button className="skip-button" onClick={() => seekTo(Math.max(0, currentTime - 15))} aria-label="Go back 15 seconds">↶ <small>15</small></button>
              <button className="play-button" onClick={() => void togglePlayback()} aria-label={playing ? "Pause" : "Play"}>{playing ? "Ⅱ" : "▶"}</button>
              <button className="skip-button" onClick={() => seekTo(Math.min(duration, currentTime + 30))} aria-label="Skip ahead 30 seconds">↷ <small>30</small></button>
            </div>
          </div>
          <label className="chapter-select">Chapter
            <select value={currentIndex >= 0 ? currentIndex : ""} onChange={(event) => seekTo(chapters[Number(event.target.value)]?.start ?? 0)} disabled={chapters.length === 0}>
              {chapters.length === 0 ? <option>No chapters</option> : chapters.map((chapter, index) => <option key={`${chapter.start}-${chapter.title}`} value={index}>{chapter.title}</option>)}
            </select>
          </label>
          <button className="close-player" onClick={() => { audioRef.current?.pause(); setSelected(null); }} aria-label="Close player">×</button>
        </section>
      )}
      <audio
        ref={audioRef}
        onLoadedMetadata={(event) => {
          const ticks = selected?.UserData?.PlaybackPositionTicks ?? 0;
          const resumeAt = ticks / 10_000_000;
          if (resumeAt > 0 && resumeAt < event.currentTarget.duration - 1) event.currentTarget.currentTime = resumeAt;
        }}
        onTimeUpdate={onTimeUpdate}
        onDurationChange={(event) => setDuration(event.currentTarget.duration || 0)}
        onPlay={() => setPlaying(true)}
        onPause={(event) => {
          setPlaying(false);
          if (session && selected) void saveProgress(selected.Id, event.currentTarget.currentTime, true).catch((reason: unknown) => {
            setError(reason instanceof Error ? reason.message : "Unable to save playback progress.");
          });
        }}
        onEnded={() => setPlaying(false)}
      />
      <footer className="footer"><span>Made for the long way home.</span><span>Powered by Jellyfin</span></footer>
    </main>
  );
}

function Brand() {
  return <div className="brand"><span className="brand-icon" aria-hidden="true">b</span><span>bookfreek<span className="brand-dot">.</span></span></div>;
}

export default App;
