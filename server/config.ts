export function normalizeJellyfinUrl(value: unknown) {
  if (typeof value !== "string" || !value.trim()) throw new Error("Enter your Jellyfin server address.");
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new Error("Enter a complete server address, including http:// or https://.");
  }
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error("Use an HTTP or HTTPS Jellyfin server address without credentials or query parameters.");
  }
  return parsed.toString().replace(/\/+$/, "");
}

export function jellyfinAuthorization(token?: string) {
  const fields = [
    'Client="BookFreek"',
    'Device="Web"',
    'DeviceId="bookfreek-web"',
    'Version="0.1.0"',
  ];
  if (token) fields.push(`Token="${encodeURIComponent(token)}"`);
  return `MediaBrowser ${fields.join(", ")}`;
}
