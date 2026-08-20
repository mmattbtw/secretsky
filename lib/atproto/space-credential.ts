import { Client, XrpcResponseError } from "@atproto/lex-client";
import { LexError } from "@atproto/lex-data";
import { asStringFormat } from "@atproto/lex-schema";
import { JoseKey } from "@atproto/jwk-jose";
import type { OAuthSession } from "@atproto/oauth-client-node";
import { createDpopProof } from "@atproto/space";
import { com } from "../lexicons";
import { resolvePds } from "./identity";

const GET_SPACE_CREDENTIAL_PATH =
  "/xrpc/com.atproto.space.getSpaceCredential";

export class SpaceCredential {
  constructor(
    readonly token: string,
    readonly key: JoseKey,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  fetch = async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const request = new Request(input, { ...init, redirect: "error" });
    request.headers.set("authorization", `DPoP ${this.token}`);
    request.headers.set(
      "dpop",
      await createDpopProof(this.key, {
        htm: request.method,
        htu: request.url,
        credential: this.token,
      }),
    );
    return this.fetchImpl(request);
  };

  client(service: string): Client {
    return new Client({ service, fetch: this.fetch });
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
  const authorityPds = await resolvePds(authority);
  const key = await JoseKey.generate(["ES256"]);
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
  key: JoseKey;
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
  request.headers.set(
    "dpop",
    await createDpopProof(input.key, {
      htm: request.method,
      htu: request.url,
    }),
  );

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
