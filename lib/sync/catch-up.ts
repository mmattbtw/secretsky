import { TID } from "@atproto/common-web";
import {
  repoRemoved,
  repoWrite,
  type RepoRemoved,
  type RepoWrite,
} from "../lexicons/com/atproto/space/defs";
import type { $OutputBody as ListWritersOutput } from "../lexicons/com/atproto/space/listWriters";

// Hosts may drop removed repos from the writer set after 72 hours without a
// notice, so an older checkpoint must list the whole writer set instead.
const CHECKPOINT_MAX_AGE_MS = 72 * 60 * 60 * 1000;

export type WriterEntry = ListWritersOutput["repos"][number];

// A listing is the latest writer state, so writers may repeat across pages.
// Save the returned checkpoint only after all corresponding repo work succeeds.
export async function catchUpRepos(
  listPage: (cursor?: string) => Promise<{ repos: WriterEntry[]; cursor?: string }>,
  handlers: {
    syncRepo: (repo: RepoWrite) => Promise<void>;
    removeRepo: (repo: RepoRemoved) => Promise<void>;
  },
  cursor?: string,
): Promise<{ cursor?: string; repoDids: Set<string> }> {
  // Repos currently in the writer set, by their latest entry in the listing.
  const repoDids = new Set<string>();
  for (;;) {
    const page = await listPage(cursor);
    if (page.repos.length === 0) return { cursor, repoDids };
    for (const entry of page.repos) {
      if (repoWrite.$isTypeOf(entry)) {
        repoDids.add(entry.repo);
        await handlers.syncRepo(entry);
      } else if (repoRemoved.$isTypeOf(entry)) {
        repoDids.delete(entry.repo);
        await handlers.removeRepo(entry);
      }
    }
    if (!page.cursor || (cursor !== undefined && page.cursor <= cursor)) {
      throw new Error("Space listing did not advance its cursor");
    }
    cursor = page.cursor;
  }
}

export function isCheckpointFresh(spaceRev: string, now = Date.now()): boolean {
  if (!TID.is(spaceRev)) return false;
  const writtenAt = TID.fromStr(spaceRev).timestamp() / 1000;
  return now - writtenAt < CHECKPOINT_MAX_AGE_MS;
}
