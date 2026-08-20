import { asAtIdentifierString } from "@atproto/lex-schema";
import { app } from "../lexicons";
import { getBskyClient } from "./bsky";

export type Profile = {
  handle: string;
  displayName: string | null;
  avatar: string | null;
};

export async function getProfile(did: string): Promise<Profile | null> {
  try {
    const profile = await getBskyClient().call(
      app.bsky.actor.getProfile,
      { actor: asAtIdentifierString(did) },
      { signal: AbortSignal.timeout(2500) },
    );
    return {
      handle: profile.handle,
      displayName: profile.displayName ?? null,
      avatar: profile.avatar ?? null,
    };
  } catch {
    // A missing or unreachable profile should never stop a board from rendering.
    return null;
  }
}
