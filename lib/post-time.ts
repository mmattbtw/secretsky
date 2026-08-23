export const ARCHIVED_POST_THRESHOLD_MS = 24 * 60 * 60 * 1000;

export function isArchivedPost(createdAt: string, indexedAt: string): boolean {
  const createdTime = Date.parse(createdAt);
  const indexedTime = Date.parse(indexedAt);
  return (
    Number.isFinite(createdTime) &&
    Number.isFinite(indexedTime) &&
    Math.abs(indexedTime - createdTime) >= ARCHIVED_POST_THRESHOLD_MS
  );
}
