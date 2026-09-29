# BookFreek

BookFreek is a mobile-first, installable audiobook PWA for a single Jellyfin user. Jellyfin remains the library and streaming server; BookFreek adds an audiobook shelf, browser playback controls, progress updates, and chapter navigation.

## Requirements

- Node.js 20 or later
- A reachable Jellyfin server and a Jellyfin user account
- Optional, read-only access for the companion service to the audiobook media folder for embedded/sidecar chapter extraction

## Local development

1. Copy `.env.example` to `.env`.
2. Set `JELLYFIN_URL` to a URL reachable from the computer running the companion service, such as `http://localhost:8096`.
3. Set `MEDIA_ROOT` to the audiobook folder path if you want embedded chapter extraction. This service only reads files.
4. Run `npm install`, then `npm run dev`.
5. Open the Vite URL shown in the terminal, usually `http://localhost:5173`, and sign in with your Jellyfin username and password.

The Jellyfin password is sent to the companion service only for sign-in. The service stores the resulting Jellyfin access token in an HTTP-only, same-site cookie; it is not exposed to browser JavaScript or placed in the audio URL. The browser remembers only the signed-in username and user ID. The server URL is configured in the companion service's environment; credentials are not saved in `.env`.

## Production

Run `npm run build`, then set `NODE_ENV=production` and start with `npm start`. The companion service serves the built PWA and the `/api` endpoints on the same port (default `3001`). Configure HTTPS at your reverse proxy for home-screen installation and secure credential transport. Do not expose an unencrypted login to the public internet.

For Docker deployment, build with `docker build -t bookfreek .` and run with `JELLYFIN_URL`, `MEDIA_ROOT=/audiobooks`, and a read-only volume mount such as `-v "C:\Media\Audiobooks:/audiobooks:ro"` (use the host path format required by your Docker shell). The companion service does not need to run on the Jellyfin host, and it does not modify or copy audiobook files. It must be able to reach Jellyfin and read the media folder if embedded chapters are required.

## Chapters

When `MEDIA_ROOT` is configured and Jellyfin provides an item path within it, BookFreek checks:

1. A JSON sidecar at `<audio-file>.chapters.json`, for example `The Book.m4b.chapters.json`.
2. Embedded chapter metadata readable by `music-metadata`.
3. Jellyfin's item chapter metadata as a fallback.

Sidecar JSON may be an array or `{ "chapters": [...] }`. Each entry accepts `title` or `name`, and `start`, `startTime`, or `startSeconds` in seconds; optional `end`, `endTime`, or `endSeconds` is also in seconds. Example:

```json
{
  "chapters": [
    { "title": "Prologue", "start": 0, "end": 92.5 },
    { "title": "Chapter 1", "start": 92.5 }
  ]
}
```

Malformed sidecars are logged by the companion service, after which embedded/Jellyfin chapter metadata is used if available.

## Current MVP notes

- Library listing queries Jellyfin audio and book items and supports server-side title sorting, year sorting, recent-first sorting, and search.
- Audio is streamed by the companion service from Jellyfin with HTTP range support; the Jellyfin token is kept in an HTTP-only cookie and is not placed in the audio URL.
- The service stores no user database and is intended for one trusted user. Protect it behind HTTPS and do not publicly expose it without adding an authentication boundary.
- The PWA shell is available offline, but media/offline audiobook downloads are not implemented.
- iOS and Android differ in background audio and PWA installation behavior; install from the browser's share/menu UI. Background playback should be tested on the target devices.
