import { isIP } from "node:net";

export function isAllowedRequestOrigin(
  origin: string | null,
  configuredUiUrl: string,
  development: boolean,
): boolean {
  if (!origin) return true;

  let requestOrigin: URL;
  let configuredOrigin: URL;
  try {
    requestOrigin = new URL(origin);
    configuredOrigin = new URL(configuredUiUrl);
  } catch {
    return false;
  }

  if (requestOrigin.origin === configuredOrigin.origin) return true;
  if (!development) return false;

  return (
    requestOrigin.protocol === configuredOrigin.protocol &&
    requestOrigin.port === configuredOrigin.port &&
    isLoopbackHostname(requestOrigin.hostname) &&
    isLoopbackHostname(configuredOrigin.hostname)
  );
}

function isLoopbackHostname(hostname: string): boolean {
  const unwrapped = hostname.replace(/^\[|\]$/g, "");
  return (
    unwrapped === "localhost" ||
    unwrapped === "::1" ||
    (isIP(unwrapped) === 4 && unwrapped.startsWith("127."))
  );
}
