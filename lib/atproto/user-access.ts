import { connectionsUri, feedUri } from "../config";
import { canAccessFeed } from "../follows";
import { verifyManagingAppRequest } from "./service-auth";

type AccessDependencies = {
  verify: typeof verifyManagingAppRequest;
  canAccessFeed: typeof canAccessFeed;
};

export async function checkUserAccess(
  request: Request,
  dependencies: AccessDependencies = {
    verify: verifyManagingAppRequest,
    canAccessFeed,
  },
): Promise<Response> {
  const url = new URL(request.url);
  const space = url.searchParams.get("space");
  const user = url.searchParams.get("user");
  const access = url.searchParams.get("access");
  const authority = space?.match(/^at:\/\/(did:[^/]+)\/space\//)?.[1];
  if (
    !space || !user || !authority ||
    (access !== "read" && access !== "write") ||
    (access === "write" && url.searchParams.has("clientId")) ||
    (space !== feedUri(authority) && space !== connectionsUri(authority))
  ) {
    return Response.json({ error: "InvalidRequest" }, { status: 400 });
  }
  try {
    await dependencies.verify(request.headers.get("authorization"), authority);
    // Both policies retain the app's existing owner/mutual access rules.
    // appAccess is open; an attested read clientId adds no restriction here.
    const authorized = space === connectionsUri(authority)
      ? user === authority
      : await dependencies.canAccessFeed(user, authority);
    return Response.json({ authorized });
  } catch (error) {
    console.error("Managing-app access check failed", error);
    return Response.json({ error: "AuthRequired" }, { status: 401 });
  }
}
