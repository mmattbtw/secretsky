import type { OAuthSession } from "@atproto/oauth-client-node";
import { ScopePermissions } from "@atproto/oauth-scopes";
import {
  BOARD_SKEY,
  CONNECTIONS_SPACE_TYPE,
  FOLLOW_COLLECTION,
  POST_COLLECTION,
  SPACE_TYPE,
} from "../config";

export type BulletinCapabilities = {
  canCreateBoard: boolean;
  canCreateNote: boolean;
  canManageFollows: boolean;
};

export async function getBulletinCapabilities(
  session: OAuthSession,
  ownerDid: string,
): Promise<BulletinCapabilities> {
  const { scope } = await session.getTokenInfo(false);
  return bulletinCapabilitiesFromScope(scope, session.did, ownerDid);
}

export function bulletinCapabilitiesFromScope(
  scope: string,
  viewerDid: string,
  ownerDid: string,
): BulletinCapabilities {
  const permissions = new ScopePermissions(scope);
  return {
    canCreateBoard:
      viewerDid === ownerDid &&
      permissions.allowsSpace({
        type: SPACE_TYPE,
        authority: viewerDid,
        skey: BOARD_SKEY,
        manage: "create",
      }),
    canCreateNote: permissions.allowsSpace({
      type: SPACE_TYPE,
      authority: ownerDid,
      skey: BOARD_SKEY,
      collection: POST_COLLECTION,
      action: "create",
    }),
    canManageFollows:
      permissions.allowsSpace({
        type: CONNECTIONS_SPACE_TYPE,
        authority: viewerDid,
        skey: BOARD_SKEY,
        manage: "create",
      }) &&
      permissions.allowsSpace({
        type: CONNECTIONS_SPACE_TYPE,
        authority: viewerDid,
        skey: BOARD_SKEY,
        collection: FOLLOW_COLLECTION,
        action: "create",
      }) &&
      permissions.allowsSpace({
        type: CONNECTIONS_SPACE_TYPE,
        authority: viewerDid,
        skey: BOARD_SKEY,
        collection: FOLLOW_COLLECTION,
        action: "delete",
      }),
  };
}
