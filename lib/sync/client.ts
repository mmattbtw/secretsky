import { getConfig } from "../config";

export async function discoverSpace(space: string): Promise<boolean> {
  const response = await fetch(`${getConfig().syncInternalUrl}/watch`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ space }),
    signal: AbortSignal.timeout(15_000),
  });
  if (response.status === 404) {
    const body: unknown = await response.json().catch(() => undefined);
    if (
      body &&
      typeof body === "object" &&
      "error" in body &&
      body.error === "Space not found"
    ) {
      return false;
    }
  }
  if (!response.ok) throw new Error(`Space sync failed (${response.status})`);
  return true;
}

export const discoverBoard = discoverSpace;
