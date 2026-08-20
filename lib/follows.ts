import { sql } from "kysely";
import { connectionsUri } from "./config";
import { getQueryDb } from "./db";

export type PrivateFollowRelationship = {
  follows: boolean;
  followedBy: boolean;
  mutual: boolean;
};

export async function getPrivateFollowRelationship(
  actorDid: string,
  otherDid: string,
): Promise<PrivateFollowRelationship> {
  if (actorDid === otherDid) {
    return { follows: true, followedBy: true, mutual: true };
  }
  const rows = await getQueryDb()
    .selectFrom("privateFollow")
    .select(["authorDid", "subjectDid"])
    .where((eb) =>
      eb.or([
        eb.and([
          eb("authorDid", "=", actorDid),
          eb("subjectDid", "=", otherDid),
        ]),
        eb.and([
          eb("authorDid", "=", otherDid),
          eb("subjectDid", "=", actorDid),
        ]),
      ]),
    )
    .execute();
  const follows = rows.some(
    (row) => row.authorDid === actorDid && row.subjectDid === otherDid,
  );
  const followedBy = rows.some(
    (row) => row.authorDid === otherDid && row.subjectDid === actorDid,
  );
  return { follows, followedBy, mutual: follows && followedBy };
}

export async function canAccessFeed(
  requesterDid: string,
  ownerDid: string,
): Promise<boolean> {
  return (await getPrivateFollowRelationship(requesterDid, ownerDid)).mutual;
}

export async function getPrivateFollowRecord(
  authorDid: string,
  subjectDid: string,
): Promise<{ uri: string; cid: string } | null> {
  const row = await getQueryDb()
    .selectFrom("privateFollow")
    .select(["uri", "cid"])
    .where("spaceUri", "=", connectionsUri(authorDid))
    .where("authorDid", "=", authorDid)
    .where("subjectDid", "=", subjectDid)
    .executeTakeFirst();
  return row ?? null;
}

export async function listIncomingFollows(ownerDid: string): Promise<
  Array<{
    requesterDid: string;
    handle: string | null;
    createdAt: string;
    followsBack: boolean;
  }>
> {
  const result = await sql<{
    requesterDid: string;
    handle: string | null;
    createdAt: string;
    followsBack: number;
  }>`
    SELECT
      incoming.author_did AS requesterDid,
      account.handle,
      incoming.created_at AS createdAt,
      EXISTS (
        SELECT 1 FROM private_follow reciprocal
        WHERE reciprocal.author_did = ${ownerDid}
          AND reciprocal.subject_did = incoming.author_did
      ) AS followsBack
    FROM private_follow incoming
    LEFT JOIN account ON account.did = incoming.author_did
    WHERE incoming.subject_did = ${ownerDid}
    ORDER BY incoming.created_at DESC
  `.execute(getQueryDb());
  return result.rows.map((row) => ({
    ...row,
    followsBack: row.followsBack === 1,
  }));
}

export async function listPrivateFollowers(ownerDid: string): Promise<
  Array<{ requesterDid: string; handle: string | null }>
> {
  return getQueryDb()
    .selectFrom("privateFollow")
    .leftJoin("account", "account.did", "privateFollow.authorDid")
    .select([
      "privateFollow.authorDid as requesterDid",
      "account.handle",
    ])
    .where("privateFollow.subjectDid", "=", ownerDid)
    .orderBy("account.handle", "asc")
    .execute();
}

export async function listPrivateFollowing(authorDid: string): Promise<
  Array<{ ownerDid: string; handle: string | null; mutual: boolean }>
> {
  const result = await sql<{
    ownerDid: string;
    handle: string | null;
    mutual: number;
  }>`
    SELECT
      outgoing.subject_did AS ownerDid,
      account.handle,
      EXISTS (
        SELECT 1 FROM private_follow reciprocal
        WHERE reciprocal.author_did = outgoing.subject_did
          AND reciprocal.subject_did = outgoing.author_did
      ) AS mutual
    FROM private_follow outgoing
    LEFT JOIN account ON account.did = outgoing.subject_did
    WHERE outgoing.author_did = ${authorDid}
    ORDER BY COALESCE(account.handle, outgoing.subject_did)
  `.execute(getQueryDb());
  return result.rows.map((row) => ({ ...row, mutual: row.mutual === 1 }));
}

export async function getMutualsAmong(
  ownerDid: string,
  otherDids: readonly string[],
): Promise<Set<string>> {
  const candidates = new Set(otherDids);
  if (candidates.size === 0) return new Set();
  const rows = await getQueryDb()
    .selectFrom("privateFollow as outgoing")
    .innerJoin("privateFollow as incoming", (join) =>
      join
        .onRef("incoming.authorDid", "=", "outgoing.subjectDid")
        .onRef("incoming.subjectDid", "=", "outgoing.authorDid"),
    )
    .select("outgoing.subjectDid")
    .where("outgoing.authorDid", "=", ownerDid)
    .execute();
  return new Set(
    rows
      .map(({ subjectDid }) => subjectDid)
      .filter((did) => candidates.has(did)),
  );
}
