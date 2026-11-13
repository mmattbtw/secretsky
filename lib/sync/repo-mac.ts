import {
  COMMIT_MAC_PROFILE,
  SpaceMacError,
  SpaceRepoVerificationError,
  encapsulate,
  formatMacRequest,
  type Encapsulation,
} from "@atproto/space";
import { asStringFormat } from "@atproto/lex-schema";
import { resolveKemDidKey } from "../atproto/identity";

// Keep the secret with its request, including concurrent reads and pagination.
// The operation must finish verification before returning any data to persist.
export async function withRepoMac<T>(
  repo: string,
  operation: (params: {
    encapsulation: Encapsulation;
    headers: Record<string, string>;
  }) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const encapsulation = await encapsulate(
      asStringFormat(await resolveKemDidKey(repo, attempt > 0), "did"),
    );

    try {
      return await operation({
        encapsulation,
        headers: {
          "accept-signature": formatMacRequest(COMMIT_MAC_PROFILE, encapsulation.keyShare),
        },
      });
    } catch (error) {
      if (attempt > 0 || !(error instanceof SpaceMacError || error instanceof SpaceRepoVerificationError)) {
        throw error;
      }
      // A rotated KEM key can invalidate the MAC. Resolve again and use a new
      // ephemeral key even when retrying the exact same URL.
    }
  }
}
