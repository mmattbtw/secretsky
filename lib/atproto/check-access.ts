import { isValidDid } from "@atproto/syntax";
import { connectionsUri, feedUri } from "../config";
import { canAccessFeed } from "../follows";
import { verifyManagingAppRequest } from "./service-auth";

type AccessDependencies = {
  verify: typeof verifyManagingAppRequest;
  canAccessFeed: typeof canAccessFeed;
};

// com.atproto.managedspace.checkAccess: one answer covers both read and write.
export async function checkAccess(
  request: Request,
  dependencies: AccessDependencies = {
    verify: verifyManagingAppRequest,
    canAccessFeed,
  },
): Promise<Response> {
  const url = new URL(request.url);
  const space = url.searchParams.get("space");
  const repo = url.searchParams.get("repo");
  const authority = space?.match(/^at:\/\/(did:[^/]+)\/space\//)?.[1];
  if (
    !space || !authority ||
    (repo !== null && !isValidDid(repo)) ||
    (space !== feedUri(authority) && space !== connectionsUri(authority))
  ) {
    return Response.json({ error: "InvalidRequest" }, { status: 400 });
  }
  try {
    await dependencies.verify(request.headers.get("authorization"), authority);
    // Both spaces are private: a request without an account is never allowed.
    // Any app may use them, so an attested clientId adds no restriction.
    const allowed = repo === null
      ? false
      : space === connectionsUri(authority)
        ? repo === authority
        : await dependencies.canAccessFeed(repo, authority);
    return Response.json({ read: allowed, write: allowed });
  } catch (error) {
    console.error("Managing-app access check failed", error);
    return Response.json({ error: "AuthRequired" }, { status: 401 });
  }
}
