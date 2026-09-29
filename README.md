# BookFreek

**A mobile-first audiobook player for your Jellyfin library.** BookFreek gives your audiobooks a dedicated, installable web app, while Jellyfin continues to manage and stream the media.

> BookFreek is an early-stage project. It has not yet been validated against a live Jellyfin server or tested on iOS/Android devices. See [Known limitations](#known-limitations).

## Features

- **Your Jellyfin audiobook shelf** — browse, search, and sort books from your existing Jellyfin server.
- **Book-focused presentation** — see Jellyfin cover art, book titles, authors, and in-progress status.
- **Mobile listening player** — play and pause, seek, skip back 15 seconds or ahead 30 seconds, and jump between chapters.
- **Pick up where you left off** — save listening position to Jellyfin and resume an unfinished book.
- **Chapter support** — read chapters embedded in audio files, use a JSON sidecar when present, or fall back to Jellyfin chapter metadata.
- **Installable PWA** — add BookFreek to your Android or iPhone home screen and open it like an app.
- **Small companion service** — connects the browser to Jellyfin, proxies artwork/audio, and can read audiobook files for chapter metadata. Media-folder access is read-only.
- **Single-user setup** — sign in with your Jellyfin account; BookFreek does not create a separate user database.

## Deploy with Portainer

The repository includes a Compose stack that builds the app and companion service from source. This repository is public, so Portainer can fetch the Compose file directly from GitHub.

### 1. Prepare the server

The Docker host needs to:

- Run Docker Compose.
- Reach your Jellyfin server over the network.
- Have the audiobook folder available as a local path for the Compose stack's read-only media mount.

Use a Jellyfin address reachable **from the container**. For example, if Jellyfin runs on another machine, use its LAN address such as `http://192.168.1.20:8096`, not `http://localhost:8096`.

### 2. Create the Portainer stack

1. In Portainer, open **Stacks** and choose **Add stack**.
2. Choose **Repository** as the build method.
3. Set the repository URL to `https://github.com/ChrisFinwall/BookFreek`.
4. Select the `main` branch and set the Compose path to `docker-compose.yml`.
5. Add these stack environment variables:

   | Variable | Required | Example | Purpose |
   |---|---|---|---|
   | `JELLYFIN_URL` | Yes | `http://192.168.1.20:8096` | Jellyfin base URL reachable from the BookFreek container |
   | `AUDIOBOOKS_PATH` | Yes | `/mnt/media/Audiobooks` | Absolute audiobook-folder path on the Docker host; mounted read-only for embedded/sidecar chapter reading |
   | `AUDIOBOOKS_CONTAINER_PATH` | No | `/audiobooks` | Path to that folder inside BookFreek's container; set it to match the path Jellyfin reports for those audio files |
   | `BOOKFREEK_PORT` | No | `3001` | Host port used to open BookFreek |

6. Deploy the stack. The first deployment builds the image from the repository and may take a few minutes.
7. Open `http://<docker-host>:<BOOKFREEK_PORT>` on your local network and sign in with your Jellyfin username and password.

The Compose stack expects the audiobook folder path and mounts it read-only into the companion container. The path inside BookFreek must match the file paths returned by Jellyfin for local chapter extraction; set `AUDIOBOOKS_CONTAINER_PATH` when Jellyfin uses a different container path. If the paths don't match, BookFreek falls back to Jellyfin's chapter metadata.

### 3. Set up remote or mobile access

For home-screen installation, serve BookFreek over **HTTPS** using your reverse proxy or trusted private-network HTTPS solution. Do not expose the plain HTTP port directly to the public internet. Configure your proxy to forward to the BookFreek container on port `3001` (or your chosen container port).

Once opened securely on your phone:

- **iPhone/iPad:** open the site in Safari, tap **Share**, then **Add to Home Screen**.
- **Android:** open the site in Chrome and choose **Install app** or **Add to Home screen**.

## Local development

Requirements: Node.js 20 or later and a reachable Jellyfin server.

1. Copy `.env.example` to `.env`.
2. Set `JELLYFIN_URL` to the Jellyfin address reachable from your computer.
3. Optionally set `MEDIA_ROOT` to the audiobook folder.
4. Run `npm install`, then `npm run dev`.
5. Open `http://localhost:5173`.

For a production build outside Portainer, run `npm run build`, set `NODE_ENV=production`, and run `npm start`. The production server serves both the app and its API on port `3001` by default.

## Chapter files

When `MEDIA_ROOT` (or the Compose `AUDIOBOOKS_PATH`) is configured and the Jellyfin item path is inside that folder, BookFreek checks:

1. `<audio-file>.chapters.json` — for example, `The Book.m4b.chapters.json`.
2. Chapter metadata embedded in the audio file.
3. Jellyfin's chapter metadata as a fallback.

A sidecar can be a JSON array or an object containing a `chapters` array. Times are in seconds:

```json
{
  "chapters": [
    { "title": "Prologue", "start": 0, "end": 92.5 },
    { "title": "Chapter 1", "start": 92.5 }
  ]
}
```

The fields `title` or `name` can name a chapter. Its start time can use `start`, `startTime`, or `startSeconds`; an optional end time can use `end`, `endTime`, or `endSeconds`. Give the container read-only access to the media folder; BookFreek does not edit or copy audiobook files.

## Security and privacy

- BookFreek sends the Jellyfin password to its companion service to authenticate with Jellyfin. It does not save the password.
- The Jellyfin token is held in an HTTP-only, same-site cookie rather than browser-accessible storage or the audio URL.
- Use HTTPS whenever credentials or listening sessions travel over a network you do not fully trust.
- The repository contains application source and deployment configuration, not your library, Jellyfin credentials, or server environment file. Do not commit `.env` or other secrets.
- The companion service is intended for one trusted user. Keep it behind your private network or a properly secured HTTPS proxy; do not treat a public GitHub repository as the deployment's authentication or network security.

## Known limitations

- This is an initial implementation and still needs validation against a real Jellyfin library and live audio playback.
- PWA installation, background playback, and browser audio support differ between iOS and Android; test on your own devices.
- The service asks Jellyfin for up to 500 matching audio/book items per request.
- Offline audiobook downloads are not implemented. Only the web app shell may be cached.
- Embedded chapter extraction requires the companion service to be able to read the corresponding media file. Without that, only chapters returned by Jellyfin are available.

## Contributing

Issues and pull requests are welcome. Before submitting changes, run:

```sh
npm install
npm test
npm run typecheck
npm run build
```
