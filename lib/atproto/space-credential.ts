import { Client, XrpcResponseError } from "@atproto/lex-client";
import { LexError } from "@atproto/lex-data";
import { asStringFormat } from "@atproto/lex-schema";
import { P256Keypair } from "@atproto/crypto";
import type { OAuthSession } from "@atproto/oauth-client-node";
import { createSpaceSigHeaders, parseSpaceToken } from "@atproto/space";
import { isValidDid } from "@atproto/syntax";
import { com } from "../lexicons";
import { resolveSpaceHost } from "./identity";

const GET_SPACE_CREDENTIAL_PATH =
  "/xrpc/com.atproto.space.getSpaceCredential";

export class SpaceCredential {
  readonly expiresAt: number;

  constructor(
    readonly token: string,
    readonly key: P256Keypair,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.expiresAt = parseSpaceToken("credential", token).payload.exp * 1000;
  }

  needsRefresh(now = Date.now()): boolean {
    return now >= this.expiresAt - 5_000;
  }

  fetch = async (
    audience: string,
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const request = new Request(input, { ...init, redirect: "error" });
    if (!isValidDid(audience)) throw new Error("Invalid space audience DID");
    const headers = await createSpaceSigHeaders(this.key, {
      authorization: `Atproto-Space ${this.token}`,
      audience,
    });
    for (const [name, value] of Object.entries(headers)) {
      request.headers.set(name, value);
    }
    return this.fetchImpl(request);
  };

  client(service: string, audience: string): Client {
    return new Client({
      service,
      fetch: (input, init) => this.fetch(audience, input, init),
    });
  }
}

export async function mintSpaceCredential(
  session: OAuthSession,
  space: string,
): Promise<SpaceCredential> {
  const viewerClient = new Client(session);
  const delegation = await viewerClient.call(
    com.atproto.space.getDelegationToken,
    { space: asStringFormat(space, "space-ref") },
  );
  const authority = space.match(/^at:\/\/(did:[^/]+)\/space\//)?.[1];
  if (!authority) throw new Error("Invalid space URI");
  const authorityPds = await resolveSpaceHost(authority);
  const key = await P256Keypair.create();
  const credential = await exchangeSpaceCredential({
    authorityPds,
    delegationToken: delegation.token,
    space,
    key,
  });
  return new SpaceCredential(credential, key);
}

export async function exchangeSpaceCredential(input: {
  authorityPds: string;
  delegationToken: string;
  space: string;
  key: P256Keypair;
  fetchImpl?: typeof fetch;
}): Promise<string> {
  const url = new URL(GET_SPACE_CREDENTIAL_PATH, input.authorityPds);
  const request = new Request(url, {
    method: "POST",
    redirect: "error",
    headers: {
      accept: "application/json",
      authorization: `Bearer ${input.delegationToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ space: input.space }),
  });
  const headers = await createSpaceSigHeaders(input.key, {
    authorization: `Bearer ${input.delegationToken}`,
  });
  for (const [name, value] of Object.entries(headers)) {
    request.headers.set(name, value);
  }

  const response = await (input.fetchImpl ?? fetch)(request);
  const body = await readJson(response);
  if (!response.ok) {
    const error = asObject(body);
    const errorCode =
      typeof error?.error === "string"
        ? error.error
        : response.status >= 500
          ? "UpstreamFailure"
          : "InvalidRequest";
    const message =
      typeof error?.message === "string" ? error.message : undefined;
    throw new XrpcResponseError(
      com.atproto.space.getSpaceCredential.main,
      response,
      {
        encoding: "application/json",
        body: { error: errorCode, ...(message ? { message } : {}) },
      },
    );
  }

  const output = asObject(body);
  if (typeof output?.credential !== "string" || !output.credential) {
    throw new LexError(
      "InvalidResponse",
      "Credential exchange returned no credential",
    );
  }
  return output.credential;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function asObject(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : undefined;
}

export async function throwSpaceResponseError(response: Response): Promise<never> {
  const body = asObject(await readJson(response));
  throw new LexError(
    typeof body?.error === "string" ? body.error : "UpstreamFailure",
    typeof body?.message === "string" ? body.message : `Space request failed (${response.status})`,
  );
}
