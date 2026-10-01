import type { Repo } from "../lexicons/com/atproto/space/listRepos";

// A listing is the latest writer state, so writers may repeat across pages.
// Save the returned checkpoint only after all corresponding repo work succeeds.
export async function catchUpRepos(
  listPage: (cursor?: string) => Promise<{ repos: Repo[]; cursor?: string }>,
  syncRepo: (repo: Repo) => Promise<void>,
  cursor?: string,
): Promise<{ cursor?: string; repoDids: Set<string> }> {
  const repoDids = new Set<string>();
  for (;;) {
    const page = await listPage(cursor);
    if (page.repos.length === 0) return { cursor, repoDids };
    for (const repo of page.repos) {
      repoDids.add(repo.did);
      await syncRepo(repo);
    }
    if (!page.cursor || (cursor !== undefined && page.cursor <= cursor)) {
      throw new Error("Space listing did not advance its cursor");
    }
    cursor = page.cursor;
  }
}
