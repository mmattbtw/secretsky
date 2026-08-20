import { cacheIdentity, resolveIdentifier } from "./atproto/identity";
import { getAccount } from "./db/queries";

type NavigationDependencies = {
  resolveIdentifier(identifier: string): Promise<string>;
  cacheIdentity(did: string): Promise<void>;
  getAccount(
    did: string,
  ): Promise<{ handle: string | null } | null | undefined>;
};

const defaultDependencies: NavigationDependencies = {
  resolveIdentifier,
  cacheIdentity,
  getAccount,
};

export async function resolveNavigationHandle(
  identifier: string,
  dependencies: NavigationDependencies = defaultDependencies,
): Promise<string | null> {
  const did = await dependencies.resolveIdentifier(identifier);
  await dependencies.cacheIdentity(did).catch(() => undefined);
  return (await dependencies.getAccount(did))?.handle ?? null;
}
