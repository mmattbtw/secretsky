export function isSupportedAtprotoDid(value: string): boolean {
  if (/^did:plc:[^/:]+$/.test(value)) return true;
  if (!value.startsWith("did:web:")) return false;

  const encodedAuthority = value.slice("did:web:".length);
  if (!encodedAuthority || encodedAuthority.includes(":")) return false;

  try {
    const authority = decodeURIComponent(encodedAuthority);
    const url = new URL(`https://${authority}`);
    return (
      Boolean(url.hostname) &&
      !url.username &&
      !url.password &&
      url.pathname === "/" &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}

export function didPathSegment(did: string): string {
  if (!isSupportedAtprotoDid(did)) {
    throw new Error("Unsupported ATProto DID");
  }
  return did.replaceAll("%", "%25");
}
