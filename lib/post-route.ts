const POST_URI_PATTERN =
  /^at:\/\/did:[^/]+\/space\/at\.secretsky\.feed\/self\/did:[^/]+\/at\.secretsky\.post\/[^/]+$/;

export function postRouteId(uri: string): string {
  if (!POST_URI_PATTERN.test(uri)) throw new Error("Invalid secretsky post URI");
  const binary = String.fromCharCode(...new TextEncoder().encode(uri));
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

export function postUriFromRouteId(id: string): string | null {
  if (!/^[A-Za-z0-9_-]+$/.test(id)) return null;
  try {
    const base64 = id.replaceAll("-", "+").replaceAll("_", "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const bytes = Uint8Array.from(atob(padded), (character) =>
      character.charCodeAt(0),
    );
    const uri = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return POST_URI_PATTERN.test(uri) ? uri : null;
  } catch {
    return null;
  }
}

export function postOwnerDid(uri: string): string | null {
  return uri.match(/^at:\/\/(did:[^/]+)\/space\//)?.[1] ?? null;
}
