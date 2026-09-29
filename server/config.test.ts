import assert from "node:assert/strict";
import test from "node:test";
import { jellyfinAuthorization, normalizeJellyfinUrl } from "./config.js";

test("normalizes Jellyfin server addresses and preserves reverse-proxy paths", () => {
  assert.equal(normalizeJellyfinUrl(" http://media.local:8096/ "), "http://media.local:8096");
  assert.equal(normalizeJellyfinUrl("https://books.example.com/jellyfin/"), "https://books.example.com/jellyfin");
});

test("rejects invalid or credential-bearing server addresses", () => {
  assert.throws(() => normalizeJellyfinUrl(""), /Enter your Jellyfin server address/);
  assert.throws(() => normalizeJellyfinUrl("not a URL"), /including http:\/\/ or https:\/\//);
  assert.throws(() => normalizeJellyfinUrl("ftp://media.local"), /Use an HTTP or HTTPS/);
  assert.throws(() => normalizeJellyfinUrl("http://user:secret@media.local"), /without credentials/);
  assert.throws(() => normalizeJellyfinUrl("http://media.local/?token=secret"), /without credentials/);
});

test("uses Jellyfin's standard Authorization header with app identity and optional token", () => {
  assert.equal(
    jellyfinAuthorization(),
    'MediaBrowser Client="BookFreek", Device="Web", DeviceId="bookfreek-web", Version="0.1.0"',
  );
  assert.equal(
    jellyfinAuthorization("token-value"),
    'MediaBrowser Client="BookFreek", Device="Web", DeviceId="bookfreek-web", Version="0.1.0", Token="token-value"',
  );
});
