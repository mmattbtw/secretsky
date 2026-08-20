import { verifyJwt } from "@atproto/xrpc-server";
import { getConfig } from "../config";
import { getIdResolver } from "../atproto/identity";

const NOTIFY_WRITE_LXM = "com.atproto.space.notifyWrite";
const NOTIFY_SPACE_DELETED_LXM = "com.atproto.space.notifySpaceDeleted";

export async function verifySyncNotification(
  authorization: string | undefined,
  space: string,
): Promise<void> {
  return verifySpaceNotification(authorization, space, NOTIFY_WRITE_LXM);
}

export async function verifySpaceDeletionNotification(
  authorization: string | undefined,
  space: string,
): Promise<void> {
  return verifySpaceNotification(
    authorization,
    space,
    NOTIFY_SPACE_DELETED_LXM,
  );
}

async function verifySpaceNotification(
  authorization: string | undefined,
  space: string,
  lxm: string,
): Promise<void> {
  const token = authorization?.match(/^Bearer (.+)$/)?.[1];
  if (!token) throw new Error("Missing service auth");
  const authority = space.match(/^at:\/\/(did:[^/]+)\/space\//)?.[1];
  if (!authority) throw new Error("Invalid board reference");
  const payload = await verifyJwt(
    token,
    getConfig().managingAppService,
    lxm,
    async (issuer, forceRefresh) => {
      const did = issuer.split("#")[0];
      return getIdResolver().did.resolveAtprotoKey(did, forceRefresh);
    },
  );
  if (payload.iss.split("#")[0] !== authority) {
    throw new Error("Notification issuer is not the board authority");
  }
}
