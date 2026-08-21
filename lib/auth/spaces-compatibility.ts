import {
  OAuthCallbackError,
  OAuthResponseError,
} from "@atproto/oauth-client-node";
import { XrpcResponseError } from "@atproto/lex-client";
import type { BulletinCapabilities } from "./bulletin-capabilities";

export function supportsSecretskySpaces(
  capabilities: BulletinCapabilities,
): boolean {
  return (
    capabilities.canCreateBoard &&
    capabilities.canCreateNote &&
    capabilities.canManageFollows
  );
}

export function isSpacesCompatibilityError(error: unknown): boolean {
  if (error instanceof OAuthCallbackError) {
    return error.params.get("error") === "invalid_scope";
  }
  if (error instanceof OAuthResponseError) {
    return error.error === "invalid_scope";
  }
  return (
    error instanceof XrpcResponseError && error.error === "XRPCNotSupported"
  );
}
