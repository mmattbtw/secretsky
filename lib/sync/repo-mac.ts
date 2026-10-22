import {
  COMMIT_MAC_TYPE,
  RepoVerificationError,
  SpaceMacError,
  WANT_MAC_HEADER,
  encapsulate,
  formatWantMacHeader,
} from "@atproto/space";
import { resolveKemDidKey } from "../atproto/identity";

// Keep the secret with its request, including concurrent reads and pagination.
// The operation must finish verification before returning any data to persist.
export async function withRepoMac<T>(
  repo: string,
  operation: (params: {
    sharedSecret: Uint8Array;
    headers: Record<string, string>;
  }) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const { keyShare, sharedSecret } = await encapsulate(
      await resolveKemDidKey(repo, attempt > 0),
    );

    try {
      return await operation({
        sharedSecret,
        headers: { [WANT_MAC_HEADER]: formatWantMacHeader(COMMIT_MAC_TYPE, keyShare) },
      });
    } catch (error) {
      if (attempt > 0 || !(error instanceof SpaceMacError || error instanceof RepoVerificationError)) {
        throw error;
      }
      // A rotated KEM key can invalidate the MAC. Resolve again and use a new
      // ephemeral key even when retrying the exact same URL.
    }
  }
}
