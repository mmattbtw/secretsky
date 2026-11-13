import { Client } from "@atproto/lex-client";
import { LexError, parseCid } from "@atproto/lex-data";
import { asStringFormat } from "@atproto/lex-schema";
import type { OAuthSession } from "@atproto/oauth-client-node";
import {
  RepoCommit,
  verifyCommit,
  verifyRepoStarFull,
  type SpaceCommit,
} from "@atproto/space";
import { boardUri, connectionsUri } from "../config";
import {
  advanceSpaceCheckpoint,
  applySyncedChanges,
  deleteSyncedRepo,
  deleteSyncedReposExcept,
  deleteSyncedSpace,
  getNotifyToken,
  getSyncedRepo,
  hideSyncedSpace,
  listSpaceWatches,
  replaceRepoRecords,
  saveBoard,
  saveSpaceWatch,
  saveSyncedRepo,
  updateSpaceWatch,
  type SpaceWatch,
  type SpaceBlob,
  type SyncedChange,
} from "../db/queries";
import { getOAuthClient, listStoredSessionDids } from "../auth/client";
import { readBlobFile, storeBlobFile } from "../blob-store";
import { com } from "../lexicons";
import { resolveSpaceHost } from "../atproto/identity";
import { getMutualsAmong } from "../follows";
import {
  mintSpaceCredential,
  throwSpaceResponseError,
  type SpaceCredential,
} from "../atproto/space-credential";
import { orderCredentialCandidates } from "./credential-candidates";
import {
  isSpaceAccessDeniedError,
  isCredentialInvalidError,
  isSpaceDeletedError,
  isSpaceNotFoundError,
  WatchInvalidatedError,
} from "./errors";
import { RECONCILE_RETRY_MS } from "./retry";
import { parseChange } from "./change-parser";
import { catchUpRepos, isCheckpointFresh } from "./catch-up";
import { withRepoMac } from "./repo-mac";

type NotifyInput = {
  space: string;
  // The update's space revision. Omitted to catch up unconditionally.
  spaceRev?: string;
  // Drop the cached credential so the next authorization renews the
  // notification registration.
  reauthorize?: boolean;
};
type OnChange = (space: string) => void;
type SyncedBlob = SpaceBlob & { bytes: Uint8Array };

export class SyncEngine {
  private credentials = new Map<string, SpaceCredential>();
  private jobs = new Map<string, Promise<void>>();
  private reconciliations = new Map<string, Promise<void>>();
  private removals = new Map<string, Promise<void>>();
  private spaceGenerations = new Map<string, number>();
  private watchGenerations = new WeakMap<SpaceWatch, number>();
  private maintenanceTimers = new Map<
    string,
    ReturnType<typeof setTimeout>
  >();

  constructor(
    private readonly onChange: OnChange,
    private readonly managingAppService: string,
    // Base URL the space host calls confirmRegistration and
    // notifySpaceUpdate against.
    private readonly notifyEndpoint: string,
  ) {}

  async resume(full = false): Promise<void> {
    const generations = new Map(this.spaceGenerations);
    const watches = await listSpaceWatches();
    await Promise.all(
      watches.map(async (watch) => {
        if (
          this.removals.has(watch.spaceUri) ||
          (this.spaceGenerations.get(watch.spaceUri) ?? 0) !==
            (generations.get(watch.spaceUri) ?? 0)
        ) {
          return;
        }
        this.bindWatch(watch);
        try {
          await this.refreshWatch(watch, !full);
        } catch (error) {
          if (isSpaceDeletedError(error)) return;
          if (isInvalidWatchError(error)) {
            await this.removeWatch(watch);
            return;
          }
          if (this.isWatchInactive(watch)) return;
          this.scheduleReconcileRetry(watch);
          await this.recordError(watch.spaceUri, error);
        }
      }),
    );
  }

  async watch(space: string): Promise<void> {
    await this.removals.get(space);
    const authorityDid = authorityFromSpace(space);
    if (
      space !== boardUri(authorityDid) &&
      space !== connectionsUri(authorityDid)
    ) {
      throw new WatchInvalidatedError();
    }
    const generation = this.spaceGenerations.get(space) ?? 0;
    const existing = (await listSpaceWatches()).find(
      (item) => item.spaceUri === space,
    );
    if (
      this.removals.has(space) ||
      generation !== (this.spaceGenerations.get(space) ?? 0)
    ) {
      throw new WatchInvalidatedError();
    }
    const watch: SpaceWatch =
      existing ?? {
        spaceUri: space,
        authorityDid,
        spaceRev: null,
        lastError: null,
      };
    this.bindWatch(watch);
    try {
      await this.assertBulletinSpace(watch);
    } catch (error) {
      if (isInvalidWatchError(error)) {
        if (existing) await this.removeWatch(watch);
        throw new WatchInvalidatedError();
      }
      throw error;
    }
    this.assertWatchActive(watch);
    const newlyInserted = !existing;
    if (newlyInserted) {
      await saveSpaceWatch({ spaceUri: space, authorityDid });
      if (this.isWatchInactive(watch)) {
        await this.startWatchRemoval(space);
        throw new WatchInvalidatedError();
      }
    }
    try {
      await this.runReconcile(watch);
      this.assertWatchActive(watch);
    } catch (error) {
      if (isSpaceNotFoundError(error)) {
        await this.removeWatch(watch);
        throw error;
      }
      if (isSpaceDeletedError(error)) throw error;
      if (this.isWatchInactive(watch)) throw error;
      this.scheduleReconcileRetry(watch);
      await this.recordError(watch.spaceUri, error);
      throw error;
    }
  }

  async notify(input: NotifyInput): Promise<void> {
    if (this.removals.has(input.space)) return;
    const generation = this.spaceGenerations.get(input.space) ?? 0;
    const watch = (await listSpaceWatches()).find(
      (item) => item.spaceUri === input.space,
    );
    if (
      !watch ||
      this.removals.has(input.space) ||
      generation !== (this.spaceGenerations.get(input.space) ?? 0)
    ) {
      return;
    }
    this.watchGenerations.set(watch, generation);
    await this.enqueue(input.space, "notification", async () => {
      if (this.isWatchInactive(watch)) return;
      // Serialize catch-up per space. Always list from the safely processed
      // checkpoint, including on gaps and out-of-order notifications.
      await this.reconciliations.get(input.space);
      const current = (await listSpaceWatches()).find(
        (item) => item.spaceUri === input.space,
      );
      if (!current || this.isWatchInactive(watch)) return;
      if (
        !input.reauthorize &&
        input.spaceRev &&
        current.spaceRev &&
        input.spaceRev <= current.spaceRev
      ) {
        return;
      }
      if (input.reauthorize) this.credentials.delete(input.space);
      watch.spaceRev = current.spaceRev;
      try {
        await this.runReconcile(watch, true);
      } catch (error) {
        if (!this.isWatchInactive(watch)) {
          this.scheduleReconcileRetry(watch);
          await this.recordError(watch.spaceUri, error);
        }
        throw error;
      }
    });
  }

  async deleteSpace(
    space: string,
    { waitForRemoval = false }: { waitForRemoval?: boolean } = {},
  ): Promise<void> {
    this.invalidateWatches(space);
    this.credentials.delete(space);
    const timer = this.maintenanceTimers.get(space);
    if (timer) clearTimeout(timer);
    this.maintenanceTimers.delete(space);
    await hideSyncedSpace(space);
    const removal = this.startWatchRemoval(space);
    if (waitForRemoval) {
      await removal;
    } else {
      void removal.catch((error) => {
        console.error(`could not delete synced space ${space}`, error);
      });
    }
  }

  stop(): void {
    for (const timer of this.maintenanceTimers.values()) clearTimeout(timer);
    this.maintenanceTimers.clear();
  }

  private async runReconcile(watch: SpaceWatch, incremental = false): Promise<void> {
    const existing = this.reconciliations.get(watch.spaceUri);
    if (existing) return existing;
    const task = this.reconcile(watch, incremental);
    this.reconciliations.set(watch.spaceUri, task);
    try {
      await task;
    } finally {
      if (this.reconciliations.get(watch.spaceUri) === task) {
        this.reconciliations.delete(watch.spaceUri);
      }
    }
  }

  private async refreshWatch(watch: SpaceWatch, incremental = false): Promise<void> {
    await this.assertBulletinSpace(watch);
    await this.runReconcile(watch, incremental);
  }

  private async reconcile(watch: SpaceWatch, incremental: boolean): Promise<void> {
    if (this.isWatchInactive(watch)) return;
    await this.withCredential(watch, async (credential) => {
      let changed = false;
      const authorityPds = await resolveSpaceHost(watch.authorityDid);
      const authorityClient = credential.client(authorityPds, watch.authorityDid);
      // An old checkpoint may predate removals the host has since forgotten.
      const since =
        incremental && watch.spaceRev && isCheckpointFresh(watch.spaceRev)
          ? watch.spaceRev
          : undefined;

      const { cursor, repoDids } = await catchUpRepos(
        (cursor) => authorityClient.call(com.atproto.space.listWriters, {
          space: asStringFormat(watch.spaceUri, "space-ref"),
          limit: 1000,
          cursor,
        }),
        {
          syncRepo: async (repo) => {
            this.assertWatchActive(watch);
            const local = await getSyncedRepo(watch.spaceUri, repo.repo);
            if (!local || local.rev < repo.repoRev) {
              await this.enqueue(watch.spaceUri, repo.repo, () =>
                this.syncRepoWithCredential(watch, repo.repo, credential),
              );
              changed = true;
            }
          },
          // A repo removed from the writer set is no longer part of the space.
          removeRepo: async (repo) => {
            this.assertWatchActive(watch);
            await this.enqueue(watch.spaceUri, repo.repo, async () => {
              if (this.isWatchInactive(watch)) return;
              if (await deleteSyncedRepo(watch.spaceUri, repo.repo)) changed = true;
            });
          },
        },
        since,
      );

      if (this.isWatchInactive(watch)) return;
      if (since === undefined) {
        changed =
          (await deleteSyncedReposExcept(watch.spaceUri, repoDids)) || changed;
      }
      if (this.isWatchInactive(watch)) return;
      if (watch.spaceUri === boardUri(watch.authorityDid)) {
        await saveBoard(watch.spaceUri, watch.authorityDid);
      }
      await updateSpaceWatch({ spaceUri: watch.spaceUri, lastError: null });
      if (cursor) await advanceSpaceCheckpoint(watch.spaceUri, cursor);
      if (changed) this.onChange(watch.spaceUri);
    });
  }

  private async assertBulletinSpace(watch: SpaceWatch): Promise<void> {
    if (
      watch.spaceUri !== boardUri(watch.authorityDid) &&
      watch.spaceUri !== connectionsUri(watch.authorityDid)
    ) {
      throw new InvalidBulletinSpaceError();
    }
    // getSpace answers only the authority's own OAuth session. Without it the
    // policy cannot be read, and the space host still enforces it.
    if (!(await listStoredSessionDids()).includes(watch.authorityDid)) return;
    let session: OAuthSession;
    try {
      session = await (await getOAuthClient()).restore(watch.authorityDid);
    } catch (error) {
      console.warn(`could not restore ${watch.authorityDid} to read its space policy`, error);
      return;
    }
    let response;
    try {
      response = await new Client(session).call(com.atproto.space.getSpace, {
        space: asStringFormat(watch.spaceUri, "space-ref"),
      });
    } catch (error) {
      if (isSpaceDeletedError(error)) await this.deleteSpace(watch.spaceUri);
      throw error;
    }
    if (
      response.space !== watch.spaceUri ||
      !com.atproto.managedspace.policy.$isTypeOf(response.policy) ||
      response.policy.managingApp !== this.managingAppService
    ) {
      throw new InvalidBulletinSpaceError();
    }
  }

  private async removeWatch(watch: SpaceWatch): Promise<void> {
    if (this.isWatchInactive(watch)) {
      await this.removals.get(watch.spaceUri);
      return;
    }
    const { spaceUri } = watch;
    this.invalidateWatches(spaceUri);
    this.credentials.delete(spaceUri);
    const timer = this.maintenanceTimers.get(spaceUri);
    if (timer) clearTimeout(timer);
    this.maintenanceTimers.delete(spaceUri);
    await this.startWatchRemoval(spaceUri);
  }

  private startWatchRemoval(space: string): Promise<void> {
    const existing = this.removals.get(space);
    if (existing) return existing;
    const removal = this.finishWatchRemoval(space);
    this.removals.set(space, removal);
    void removal.then(
      () => {
        if (this.removals.get(space) === removal) this.removals.delete(space);
      },
      () => {
        if (this.removals.get(space) === removal) this.removals.delete(space);
      },
    );
    return removal;
  }

  private async finishWatchRemoval(space: string): Promise<void> {
    const reconcileJob = this.reconciliations.get(space);
    const repoJobs = [...this.jobs.entries()]
      .filter(([key]) => key.startsWith(`${space}|`))
      .map(([, job]) => job);
    await Promise.allSettled([
      ...(reconcileJob ? [reconcileJob] : []),
      ...repoJobs,
    ]);
    await deleteSyncedSpace(space);
    this.onChange(space);
  }

  private bindWatch(watch: SpaceWatch): void {
    this.watchGenerations.set(
      watch,
      this.spaceGenerations.get(watch.spaceUri) ?? 0,
    );
  }

  private invalidateWatches(space: string): void {
    this.spaceGenerations.set(space, (this.spaceGenerations.get(space) ?? 0) + 1);
  }

  private isWatchInactive(watch: SpaceWatch): boolean {
    return (
      this.watchGenerations.get(watch) !==
        (this.spaceGenerations.get(watch.spaceUri) ?? 0)
    );
  }

  private assertWatchActive(watch: SpaceWatch): void {
    if (this.isWatchInactive(watch)) {
      throw new WatchInvalidatedError();
    }
  }

  private scheduleReconcileRetry(watch: SpaceWatch): void {
    if (this.isWatchInactive(watch)) return;
    const existing = this.maintenanceTimers.get(watch.spaceUri);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      this.maintenanceTimers.delete(watch.spaceUri);
      void this.refreshWatch(watch)
        .catch(async (error) => {
          if (isSpaceDeletedError(error)) return;
          if (isInvalidWatchError(error)) {
            await this.removeWatch(watch);
            return;
          }
          if (this.isWatchInactive(watch)) return;
          this.scheduleReconcileRetry(watch);
          await this.recordError(watch.spaceUri, error);
        })
        .catch((error) => console.error("could not record sync error", error));
    }, RECONCILE_RETRY_MS);
    timer.unref();
    this.maintenanceTimers.set(watch.spaceUri, timer);
  }

  private async syncRepoWithCredential(
    watch: SpaceWatch,
    repoDid: string,
    credential: SpaceCredential,
  ): Promise<void> {
    if (this.isWatchInactive(watch)) return;
    const local = await getSyncedRepo(watch.spaceUri, repoDid);
    if (!local) {
      await this.recoverRepo(watch, repoDid, credential);
      return;
    }

    try {
      const client = credential.client(local.pdsUrl, repoDid);
      const state = RepoCommit.fromState(local.ltHash);
      const changes: SyncedChange[] = [];
      let cursor: string | undefined;
      let commit: SpaceCommit | undefined;

      do {
        const page = await withRepoMac(repoDid, async ({ encapsulation, headers }) => {
          const response = await client.xrpc(com.atproto.space.listRepoOps, {
            params: {
              space: asStringFormat(watch.spaceUri, "space-ref"),
              repo: asStringFormat(repoDid, "did"),
              since: local.rev,
              cursor,
              limit: 1000,
            },
            headers,
          });
          // Every page carries the repo's current commit, MACed for this request.
          verifyCommit(response.body.commit, {
            ...encapsulation,
            headers: response.headers,
            space: asStringFormat(watch.spaceUri, "space-ref"),
            repo: asStringFormat(repoDid, "did"),
          });
          return response.body;
        });
        for (const op of page.ops) {
          state.applyOp({
            collection: op.collection,
            rkey: op.rkey,
            cid: op.cid ? parseCid(op.cid) : null,
            prev: op.prev ? parseCid(op.prev) : null,
          });
          const change = parseChange({
            space: watch.spaceUri,
            repoDid,
            collection: op.collection,
            rkey: op.rkey,
            cid: op.cid,
            value: op.value,
          });
          if (change) changes.push(change);
        }
        cursor = page.cursor;
        commit = page.commit;
      } while (cursor);

      if (!commit) throw new Error("Incremental sync did not reach a commit");
      if (!state.matches(commit)) {
        throw new Error("Incremental sync data mismatch");
      }

      const blobs = await this.fetchImageBlobs(
        changes,
        local.pdsUrl,
        credential,
      );
      if (this.isWatchInactive(watch)) return;
      await applySyncedChanges(changes, stripBlobBytes(blobs));
      storeBlobFiles(blobs);
      await saveSyncedRepo({
        spaceUri: watch.spaceUri,
        repoDid,
        pdsUrl: local.pdsUrl,
        rev: commit.rev,
        ltHash: state.setHash.state(),
        commitHash: commit.data,
      });
    } catch (error) {
      if (this.isWatchInactive(watch)) return;
      if (isCredentialInvalidError(error)) throw error;
      console.warn(`incremental sync fell back to recovery for ${repoDid}`, error);
      await this.recoverRepo(watch, repoDid, credential);
    }
  }

  private async recoverRepo(
    watch: SpaceWatch,
    repoDid: string,
    credential: SpaceCredential,
  ): Promise<void> {
    const space = watch.spaceUri;
    // Resolve the current host rather than the cached one, so a repo whose
    // account migrated is read from its new host.
    const pdsUrl = await resolveSpaceHost(repoDid);
    const url = new URL(`${pdsUrl}/xrpc/com.atproto.space.getRepo`);
    url.searchParams.set("space", space);
    url.searchParams.set("repo", repoDid);
    let recovered;
    try {
      recovered = await withRepoMac(repoDid, async ({ encapsulation, headers }) => {
        const response = await credential.fetch(repoDid, url, { headers });
        if (!response.ok) await throwSpaceResponseError(response);
        return verifyRepoStarFull(
          [new Uint8Array(await response.arrayBuffer())],
          {
            ...encapsulation,
            headers: response.headers,
            space: asStringFormat(space, "space-ref"),
            repo: asStringFormat(repoDid, "did"),
          },
        );
      });
    } catch (error) {
      // A host may discard an emptied space repo; that reads as an empty repo.
      if (!isRepoNotFoundError(error)) throw error;
      if (this.isWatchInactive(watch)) return;
      if (await deleteSyncedRepo(space, repoDid)) this.onChange(space);
      return;
    }
    const posts: Parameters<typeof replaceRepoRecords>[0]["posts"] = [];
    const removals: Parameters<typeof replaceRepoRecords>[0]["removals"] = [];
    const reactions: NonNullable<Parameters<typeof replaceRepoRecords>[0]["reactions"]> = [];
    const privateFollows: NonNullable<
      Parameters<typeof replaceRepoRecords>[0]["privateFollows"]
    > = [];
    const positions: Parameters<typeof replaceRepoRecords>[0]["positions"] = [];
    const postChanges: Extract<SyncedChange, { kind: "post" }>[] = [];

    for (const record of recovered.records) {
      const change = parseChange({
        space,
        repoDid,
        collection: record.collection,
        rkey: record.rkey,
        cid: record.cid.toString(),
        value: record.record,
      });
      if (change?.kind === "post") {
        postChanges.push(change);
        posts.push(stripPost(change.value));
      }
      if (change?.kind === "removal") {
        removals.push(stripRemoval(change.value));
      }
      if (change?.kind === "reaction") {
        reactions.push(stripReaction(change.value));
      }
      if (change?.kind === "privateFollow") {
        privateFollows.push(stripPrivateFollow(change.value));
      }
      if (change?.kind === "position") positions.push(stripPosition(change.value));
    }

    const blobs = await this.fetchImageBlobs(postChanges, pdsUrl, credential);
    if (this.isWatchInactive(watch)) return;
    await replaceRepoRecords({
      spaceUri: space,
      authorDid: repoDid,
      posts,
      removals,
      reactions,
      privateFollows,
      positions,
      blobs: stripBlobBytes(blobs),
    });
    storeBlobFiles(blobs);
    await saveSyncedRepo({
      spaceUri: space,
      repoDid,
      pdsUrl,
      rev: recovered.commit.rev,
      ltHash: RepoCommit.fromRecords(recovered.records).setHash.state(),
      commitHash: recovered.commit.data,
    });
  }

  private async fetchImageBlobs(
    changes: SyncedChange[],
    pdsUrl: string,
    credential: SpaceCredential,
  ): Promise<SyncedBlob[]> {
    const blobs = new Map<string, SyncedBlob>();
    const finalPostChanges: Extract<SyncedChange, { kind: "post" }>[] = [];
    const seenUris = new Set<string>();
    for (let index = changes.length - 1; index >= 0; index--) {
      const change = changes[index];
      if (change.kind === "post") {
        if (!seenUris.has(change.value.uri)) finalPostChanges.push(change);
        seenUris.add(change.value.uri);
      } else if (change.kind === "delete" && change.table === "post") {
        seenUris.add(change.uri);
      }
    }

    for (const change of finalPostChanges) {
      if (change.kind !== "post" || !change.value.image) continue;
      const { image, spaceUri, authorDid } = change.value;
      const key = `${spaceUri}\u0000${authorDid}\u0000${image.cid}`;
      const prior = blobs.get(key);
      if (prior) {
        if (prior.mimeType !== image.mimeType || prior.size !== image.size) {
          throw new Error("Conflicting image metadata for the same blob");
        }
        continue;
      }

      let bytes = readBlobFile(image.cid) ?? undefined;
      if (!bytes || bytes.length !== image.size) {
        bytes = await credential.client(pdsUrl, authorDid).call(
          com.atproto.space.getBlob,
          {
            space: asStringFormat(spaceUri, "space-ref"),
            repo: asStringFormat(authorDid, "did"),
            cid: image.cid,
          },
        );
      }
      if (bytes.length !== image.size) {
        throw new Error(`Image blob had an unexpected size (${image.cid})`);
      }
      blobs.set(key, {
        spaceUri,
        repoDid: authorDid,
        cid: image.cid,
        mimeType: image.mimeType,
        size: image.size,
        bytes,
      });
    }
    return [...blobs.values()];
  }

  private async withCredential<T>(
    watch: SpaceWatch,
    operation: (credential: SpaceCredential) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; attempt < 2; attempt++) {
      let credential: SpaceCredential;
      try {
        credential = await this.credentialFor(watch, attempt > 0);
      } catch (error) {
        if (isSpaceDeletedError(error)) await this.deleteSpace(watch.spaceUri);
        throw error;
      }
      try {
        return await operation(credential);
      } catch (error) {
        if (isSpaceDeletedError(error)) {
          await this.deleteSpace(watch.spaceUri);
          throw error;
        }
        if (isSpaceNotFoundError(error)) throw error;
        this.credentials.delete(watch.spaceUri);
        if (attempt > 0) throw error;
      }
    }
    throw new Error("Could not obtain a board sync credential");
  }

  private async credentialFor(
    watch: SpaceWatch,
    refresh = false,
  ): Promise<SpaceCredential> {
    if (!refresh) {
      const existing = this.credentials.get(watch.spaceUri);
      if (existing && !existing.needsRefresh()) return existing;
      this.credentials.delete(watch.spaceUri);
    }
    const sessionDids = await listStoredSessionDids();
    const oauthClient = await getOAuthClient();
    // Every authorization renews this watch's notification registration.
    const token = await getNotifyToken(watch.spaceUri);
    const notify = token ? { endpoint: this.notifyEndpoint, token } : undefined;
    let lastError: unknown;
    let notFoundError: unknown;

    if (sessionDids.includes(watch.authorityDid)) {
      try {
        const session = await oauthClient.restore(watch.authorityDid);
        const credential = await mintSpaceCredential(session, watch.spaceUri, notify);
        this.credentials.set(watch.spaceUri, credential);
        return credential;
      } catch (error) {
        // The authority is always authorized, so its answer is definitive.
        if (isSpaceDeletedError(error) || isSpaceNotFoundError(error)) {
          throw error;
        }
        lastError = error;
        if (!isSpaceAccessDeniedError(error)) {
          console.warn(
            `could not mint sync credential for ${watch.authorityDid}`,
            error,
          );
        }
      }
    }

    const otherDids = sessionDids.filter((did) => did !== watch.authorityDid);
    const mutuals = await getMutualsAmong(watch.authorityDid, otherDids);
    const candidates = orderCredentialCandidates(
      watch.authorityDid,
      otherDids,
      mutuals,
    );

    for (const did of candidates) {
      try {
        const session = await oauthClient.restore(did);
        const credential = await mintSpaceCredential(session, watch.spaceUri, notify);
        this.credentials.set(watch.spaceUri, credential);
        return credential;
      } catch (error) {
        if (isSpaceDeletedError(error)) throw error;
        // The host also answers SpaceNotFound to accounts it refuses, so try
        // the remaining sessions before concluding the space is missing.
        if (isSpaceNotFoundError(error)) {
          notFoundError ??= error;
          continue;
        }
        lastError = error;
        if (!isSpaceAccessDeniedError(error)) {
          console.warn(`could not mint sync credential for ${did}`, error);
        }
      }
    }

    throw lastError ??
      notFoundError ??
      new Error("No authorized OAuth session can sync this board");
  }

  private enqueue(space: string, repo: string, job: () => Promise<void>): Promise<void> {
    const key = `${space}|${repo}`;
    const previous = this.jobs.get(key) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(job);
    this.jobs.set(key, next);
    const cleanup = () => {
      if (this.jobs.get(key) === next) this.jobs.delete(key);
    };
    void next.then(cleanup, cleanup);
    return next;
  }

  private async recordError(space: string, error: unknown): Promise<void> {
    if (isSpaceAccessDeniedError(error)) {
      console.warn(`sync paused for ${space}: no stored session has access`);
    } else {
      console.error(`sync failed for ${space}`, error);
    }
    await updateSpaceWatch({
      spaceUri: space,
      lastError: error instanceof Error ? error.message : "Sync failed",
    });
  }
}

class InvalidBulletinSpaceError extends Error {
  constructor() {
    super("Space is not managed by secretsky");
    this.name = "InvalidBulletinSpaceError";
  }
}

function isRepoNotFoundError(error: unknown): boolean {
  return error instanceof LexError && error.error === "RepoNotFound";
}

function isInvalidWatchError(error: unknown): boolean {
  return (
    error instanceof InvalidBulletinSpaceError || isSpaceNotFoundError(error)
  );
}

function authorityFromSpace(space: string): string {
  const authority = space.match(/^at:\/\/(did:[^/]+)\/space\//)?.[1];
  if (!authority) throw new Error("Invalid board reference");
  return authority;
}

function stripPost(value: Extract<SyncedChange, { kind: "post" }>["value"]) {
  return {
    cid: value.cid,
    uri: value.uri,
    text: value.text,
    image: value.image,
    replyParentUri: value.replyParentUri,
    replyParentCid: value.replyParentCid,
    color: value.color,
    rotation: value.rotation,
    x: value.x,
    y: value.y,
    createdAt: value.createdAt,
  };
}

function stripReaction(
  value: Extract<SyncedChange, { kind: "reaction" }>["value"],
) {
  return {
    cid: value.cid,
    uri: value.uri,
    subjectUri: value.subjectUri,
    subjectCid: value.subjectCid,
    emoji: value.emoji,
    createdAt: value.createdAt,
  };
}

function stripPrivateFollow(
  value: Extract<SyncedChange, { kind: "privateFollow" }>["value"],
) {
  return {
    cid: value.cid,
    uri: value.uri,
    subjectDid: value.subjectDid,
    createdAt: value.createdAt,
  };
}

function stripRemoval(
  value: Extract<SyncedChange, { kind: "removal" }>["value"],
) {
  return {
    cid: value.cid,
    uri: value.uri,
    subjectUri: value.subjectUri,
    subjectCid: value.subjectCid,
    createdAt: value.createdAt,
  };
}

function stripPosition(value: Extract<SyncedChange, { kind: "position" }>["value"]) {
  return {
    cid: value.cid,
    uri: value.uri,
    subjectUri: value.subjectUri,
    subjectCid: value.subjectCid,
    x: value.x,
    y: value.y,
    createdAt: value.createdAt,
  };
}

function stripBlobBytes(blobs: SyncedBlob[]): SpaceBlob[] {
  return blobs.map((blob) => ({
    spaceUri: blob.spaceUri,
    repoDid: blob.repoDid,
    cid: blob.cid,
    mimeType: blob.mimeType,
    size: blob.size,
  }));
}

function storeBlobFiles(blobs: SyncedBlob[]): void {
  for (const blob of blobs) storeBlobFile(blob.cid, blob.bytes);
}
