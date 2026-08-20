import { getPdsEndpoint } from "@atproto/common-web";
import { IdResolver } from "@atproto/identity";
import { getConfig } from "../config";
import { getAccount, saveAccount } from "../db/queries";

let resolver: IdResolver | undefined;

export function getIdResolver(): IdResolver {
  resolver ??= new IdResolver({ plcUrl: getConfig().plcUrl });
  return resolver;
}

export async function resolveDid(did: string, forceRefresh = false) {
  const doc = await getIdResolver().did.resolve(did, forceRefresh);
  if (!doc) throw new Error(`Could not resolve ${did}`);
  return doc;
}

export async function resolvePds(did: string): Promise<string> {
  const cached = (await getAccount(did))?.pdsUrl;
  if (cached) return cached;
  const doc = await resolveDid(did);
  const pdsUrl = getPdsEndpoint(doc);
  if (!pdsUrl) throw new Error(`${did} has no PDS endpoint`);
  const handle = doc.alsoKnownAs
    ?.find((value) => value.startsWith("at://"))
    ?.slice("at://".length);
  await saveAccount({ did, handle, pdsUrl });
  return pdsUrl;
}

export async function resolveIdentifier(identifier: string): Promise<string> {
  if (identifier.startsWith("did:")) return identifier;
  const handle = identifier.replace(/^@/, "");
  const did = await resolveHandle(handle);
  if (!did) throw new Error(`Could not resolve @${handle}`);
  return did;
}

export async function resolveHandle(handle: string): Promise<string | null> {
  const { devIntrospectUrl } = getConfig();
  const resolved = await getIdResolver().handle.resolve(handle);
  if (resolved) return resolved;
  if (!devIntrospectUrl) return null;

  for (const pdsUrl of await getDevPdsUrls(devIntrospectUrl, handle)) {
    const did = await resolveHandleAt(pdsUrl, handle);
    if (did) return did;
  }
  return null;
}

async function resolveHandleAt(service: string, handle: string): Promise<string | null> {
  const url = new URL(`${service}/xrpc/com.atproto.identity.resolveHandle`);
  url.searchParams.set("handle", handle);
  const response = await fetch(url, { cache: "no-store" });
  if (response.ok) {
    const body = (await response.json()) as { did: string };
    return body.did;
  }
  if (response.status === 400) return null;
  throw new Error(`Handle resolution failed (${response.status})`);
}

async function getDevPdsUrls(
  introspectUrl: string,
  handle: string,
): Promise<string[]> {
  const response = await fetch(introspectUrl);
  if (!response.ok) throw new Error(`Introspection failed (${response.status})`);
  const body = (await response.json()) as {
    pdses?: Array<{ url: string; handleDomains?: string[] }>;
  };
  return (body.pdses ?? [])
    .filter((pds) =>
      pds.handleDomains?.some((domain) => handle.endsWith(domain)),
    )
    .map((pds) => pds.url);
}

export async function cacheIdentity(did: string): Promise<void> {
  const doc = await resolveDid(did);
  const pdsUrl = getPdsEndpoint(doc);
  const handle = doc.alsoKnownAs
    ?.find((value) => value.startsWith("at://"))
    ?.slice("at://".length);
  await saveAccount({ did, handle, pdsUrl });
}
