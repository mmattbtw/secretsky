import { describe, expect, test } from "bun:test";
import type { OAuthSession } from "@atproto/oauth-client-node";
import {
  createBoard,
  type FeedSpaceDependencies,
} from "./actions";
import { boardUri } from "../config";

const ownerDid = "did:plc:login-owner";
const session = { did: ownerDid } as unknown as OAuthSession;

function dependencies(
  overrides: Partial<FeedSpaceDependencies> = {},
): FeedSpaceDependencies {
  return {
    ensureConnectionsSpace: async () => `at://${ownerDid}/space/at.secretsky.connections/self`,
    hasBoard: async () => false,
    discoverSpace: async () => false,
    createSpace: async () => boardUri(ownerDid),
    saveBoard: async () => undefined,
    ...overrides,
  };
}

describe("login feed provisioning", () => {
  test("creates and stores the feed on first login", async () => {
    const saved: Array<[string, string]> = [];
    let createCalls = 0;
    const space = await createBoard(session, dependencies({
      createSpace: async () => {
        createCalls += 1;
        return boardUri(ownerDid);
      },
      saveBoard: async (spaceUri, did) => {
        saved.push([spaceUri, did]);
      },
    }));

    expect(space).toBe(boardUri(ownerDid));
    expect(createCalls).toBe(1);
    expect(saved).toEqual([[boardUri(ownerDid), ownerDid]]);
  });

  test("does not replace an existing feed on repeat login", async () => {
    let createCalls = 0;
    let discoveryCalls = 0;
    const space = await createBoard(session, dependencies({
      hasBoard: async () => true,
      discoverSpace: async () => {
        discoveryCalls += 1;
        return true;
      },
      createSpace: async () => {
        createCalls += 1;
        return boardUri(ownerDid);
      },
    }));

    expect(space).toBe(boardUri(ownerDid));
    expect(discoveryCalls).toBe(0);
    expect(createCalls).toBe(0);
  });

  test("adopts a remote feed missing from the local database", async () => {
    const saved: Array<[string, string]> = [];
    let createCalls = 0;
    const space = await createBoard(session, dependencies({
      discoverSpace: async () => true,
      createSpace: async () => {
        createCalls += 1;
        return boardUri(ownerDid);
      },
      saveBoard: async (spaceUri, did) => {
        saved.push([spaceUri, did]);
      },
    }));

    expect(space).toBe(boardUri(ownerDid));
    expect(createCalls).toBe(0);
    expect(saved).toEqual([[boardUri(ownerDid), ownerDid]]);
  });

  test("recovers when another login creates the feed first", async () => {
    let discoveryCalls = 0;
    const space = await createBoard(session, dependencies({
      discoverSpace: async () => {
        discoveryCalls += 1;
        return discoveryCalls === 2;
      },
      createSpace: async () => {
        throw new Error("Space already exists");
      },
    }));

    expect(space).toBe(boardUri(ownerDid));
    expect(discoveryCalls).toBe(2);
  });

  test("keeps the creation error when no feed exists", async () => {
    const failure = new Error("Could not create space");
    await expect(createBoard(session, dependencies({
      createSpace: async () => {
        throw failure;
      },
    }))).rejects.toBe(failure);
  });
});
