export function orderCredentialCandidates(
  authorityDid: string,
  sessionDids: string[],
  followerDids: ReadonlySet<string>,
): string[] {
  const available = new Set(sessionDids);
  const ordered: string[] = [];

  if (available.has(authorityDid)) ordered.push(authorityDid);
  for (const did of sessionDids) {
    if (
      did !== authorityDid &&
      followerDids.has(did) &&
      !ordered.includes(did)
    ) {
      ordered.push(did);
    }
  }

  return ordered;
}
