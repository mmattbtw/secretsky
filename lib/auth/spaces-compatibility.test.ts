import assert from "node:assert/strict";
import { test } from "bun:test";
import {
  OAuthCallbackError,
  OAuthResponseError,
} from "@atproto/oauth-client-node";
import { XrpcResponseError } from "@atproto/lex-client";
import { com } from "../lexicons";
import {
  isSpacesCompatibilityError,
  supportsSecretskySpaces,
} from "./spaces-compatibility";

test("secretsky requires every Spaces capability", () => {
  assert.equal(supportsSecretskySpaces({
    canCreateBoard: true,
    canCreateNote: true,
    canManageFollows: true,
  }), true);
  assert.equal(supportsSecretskySpaces({
    canCreateBoard: true,
    canCreateNote: false,
    canManageFollows: true,
  }), false);
});

test("invalid OAuth scopes identify a non-compatible PDS", () => {
  assert.equal(isSpacesCompatibilityError(new OAuthCallbackError(
    new URLSearchParams({ error: "invalid_scope" }),
  )), true);
  assert.equal(isSpacesCompatibilityError(new OAuthResponseError(
    new Response(null, { status: 400 }),
    { error: "invalid_scope" },
  )), true);
});

test("a missing Spaces XRPC method identifies a non-compatible PDS", () => {
  const error = new XrpcResponseError(
    com.atproto.simplespace.createSpace.main,
    new Response(null, { status: 404 }),
    {
      encoding: "application/json",
      body: { error: "XRPCNotSupported" },
    },
  );
  assert.equal(isSpacesCompatibilityError(error), true);
  assert.equal(isSpacesCompatibilityError(new Error("network failed")), false);
});
