import type { OAuthSession } from "@atproto/oauth-client-node";
import { mintSpaceCredential } from "./space-credential";
import {
  isSpaceAccessDeniedError,
  isSpaceDeletedError,
  isSpaceNotFoundError,
} from "../sync/errors";

type CredentialMinter = (
  session: OAuthSession,
  space: string,
) => Promise<unknown>;

export async function probeSpaceExists(
  session: OAuthSession,
  space: string,
  mintCredential: CredentialMinter = mintSpaceCredential,
): Promise<boolean> {
  try {
    await mintCredential(session, space);
    return true;
  } catch (error) {
    if (isSpaceNotFoundError(error) || isSpaceDeletedError(error)) return false;
    if (isSpaceAccessDeniedError(error)) return true;
    throw error;
  }
}
