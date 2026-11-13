import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { isNotifyToken } from "../db/queries";
import { SyncEngine } from "./engine";
import { isBoardAbsentError } from "./errors";

const REPO_WRITE = "com.atproto.space.defs#repoWrite";
const REPO_REMOVED = "com.atproto.space.defs#repoRemoved";
const SPACE_DELETED = "com.atproto.space.notifySpaceUpdate#spaceDeleted";
const REGISTRATION_EXPIRED =
  "com.atproto.space.notifySpaceUpdate#registrationExpired";

export type SyncServiceOptions = {
  internalUrl: string;
  managingAppService: string;
  // Public base URL that space hosts send notification calls to.
  notifyEndpoint: string;
  pollInterval?: number;
};

export class SyncService {
  readonly #clients = new Map<string, Set<ServerResponse>>();
  readonly #engine: SyncEngine;
  readonly #server = createServer((request, response) => {
    void this.#handle(request, response);
  });
  readonly #options: SyncServiceOptions;
  #heartbeatTimer: NodeJS.Timeout | undefined;
  #reconcileTimer: NodeJS.Timeout | undefined;
  #resumeTask: Promise<void> | undefined;
  #started = false;
  #closeTask: Promise<void> | undefined;

  constructor(options: SyncServiceOptions) {
    this.#options = options;
    this.#engine = new SyncEngine(
      (space) => this.#broadcast(space),
      options.managingAppService,
      options.notifyEndpoint,
    );
  }

  async start(): Promise<void> {
    if (this.#started) return;
    const url = new URL(this.#options.internalUrl);
    const port = Number(url.port || 80);
    const hostname = url.hostname.replace(/^\[(.*)\]$/, "$1");

    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => reject(error);
      this.#server.once("error", onError);
      this.#server.listen(port, hostname, () => {
        this.#server.off("error", onError);
        resolve();
      });
    });

    this.#started = true;
    this.#heartbeatTimer = setInterval(() => this.#heartbeat(), 20_000);
    if (this.#options.pollInterval) {
      this.#reconcileTimer = setInterval(
        () => this.#resume(true),
        this.#options.pollInterval,
      );
      this.#reconcileTimer.unref();
    }
    this.#resume();
    console.log(`secretsky internal sync service ${this.#options.internalUrl}`);
  }

  close(): Promise<void> {
    if (this.#closeTask) return this.#closeTask;
    this.#closeTask = this.#close();
    return this.#closeTask;
  }

  async #close(): Promise<void> {
    this.#engine.stop();
    if (this.#heartbeatTimer) clearInterval(this.#heartbeatTimer);
    if (this.#reconcileTimer) clearInterval(this.#reconcileTimer);
    for (const group of this.#clients.values()) {
      for (const client of group) client.end();
    }
    this.#clients.clear();
    if (this.#started) {
      await new Promise<void>((resolve, reject) => {
        this.#server.close((error) => (error ? reject(error) : resolve()));
        this.#server.closeAllConnections();
      });
      this.#started = false;
    }
    await this.#resumeTask?.catch(() => undefined);
  }

  async #handle(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    try {
      const url = new URL(request.url ?? "/", this.#options.internalUrl);
      if (request.method === "GET" && url.pathname === "/health") {
        return json(response, 200, { ok: true });
      }
      if (request.method === "GET" && url.pathname === "/events") {
        const space = url.searchParams.get("space");
        if (!space) return json(response, 400, { error: "Missing Space" });
        response.writeHead(200, {
          "content-type": "text/event-stream",
          "cache-control": "no-cache, no-transform",
          connection: "keep-alive",
        });
        response.write(": connected\n\n");
        const group = this.#clients.get(space) ?? new Set<ServerResponse>();
        group.add(response);
        this.#clients.set(space, group);
        request.on("close", () => {
          group.delete(response);
          if (group.size === 0) this.#clients.delete(space);
        });
        return;
      }
      if (request.method === "POST" && url.pathname === "/watch") {
        const body = await readJson(request);
        if (typeof body.space !== "string") {
          return json(response, 400, { error: "Invalid Space subscription" });
        }
        try {
          await this.#engine.watch(body.space);
        } catch (error) {
          if (isBoardAbsentError(error)) {
            return json(response, 404, { error: "Space not found" });
          }
          throw error;
        }
        return json(response, 200, { ok: true });
      }
      if (
        request.method === "POST" &&
        url.pathname === "/xrpc/com.atproto.space.confirmRegistration"
      ) {
        // The space host checks that this service issued the token for the
        // space before registering it. The token is the only authentication.
        const body = await readJson(request);
        if (
          !isTokenBody(body) ||
          typeof body.challenge !== "string" ||
          body.challenge.length > 512 ||
          !(await isNotifyToken(body.space, body.token))
        ) {
          return json(response, 400, { error: "InvalidRequest" });
        }
        return json(response, 200, { challenge: body.challenge });
      }
      if (
        request.method === "POST" &&
        url.pathname === "/xrpc/com.atproto.space.notifySpaceUpdate"
      ) {
        const body = await readJson(request);
        // Rejecting an unknown token (including one for a watch that has been
        // removed) is a non-retryable error, which unregisters the endpoint.
        if (!isTokenBody(body) || !(await isNotifyToken(body.space, body.token))) {
          return json(response, 400, { error: "InvalidRequest" });
        }
        const update = body.update;
        const type = update && typeof update === "object" && "$type" in update
          ? update.$type : undefined;
        const spaceRev = update && typeof update === "object" &&
          "spaceRev" in update && typeof update.spaceRev === "string"
          ? update.spaceRev : undefined;
        if (type === REPO_WRITE || type === REPO_REMOVED) {
          if (!spaceRev) return json(response, 400, { error: "InvalidRequest" });
          json(response, 200, {});
          this.#notify({ space: body.space, spaceRev });
          return;
        }
        if (type === REGISTRATION_EXPIRED || type === SPACE_DELETED) {
          // Reauthorize, which renews the registration and catches up. Only a
          // SpaceDeleted answer to that confirms a deletion.
          json(response, 200, {});
          this.#notify({ space: body.space, reauthorize: true });
          return;
        }
        return json(response, 200, {});
      }
      return json(response, 404, { error: "Not found" });
    } catch (error) {
      console.error("sync service request failed", error);
      return json(response, 500, { error: "Sync failed" });
    }
  }

  #notify(input: Parameters<SyncEngine["notify"]>[0]): void {
    void this.#engine
      .notify(input)
      .catch((error) => console.error("notification sync failed", error));
  }

  #resume(full = false): void {
    if (this.#resumeTask) return;
    const task = this.#engine.resume(full);
    this.#resumeTask = task;
    void task
      .catch((error) => console.error("sync reconciliation failed", error))
      .finally(() => {
        if (this.#resumeTask === task) this.#resumeTask = undefined;
      });
  }

  #heartbeat(): void {
    for (const group of this.#clients.values()) {
      for (const client of group) client.write(": keepalive\n\n");
    }
  }

  #broadcast(space: string): void {
    const payload = `data: ${JSON.stringify({ space })}\n\n`;
    for (const client of this.#clients.get(space) ?? []) client.write(payload);
  }
}

async function readJson(
  request: IncomingMessage,
): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > 64 * 1024) throw new Error("Request body too large");
    chunks.push(bytes);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<
    string,
    unknown
  >;
}

function isTokenBody(
  body: Record<string, unknown>,
): body is Record<string, unknown> & { space: string; token: string } {
  return (
    typeof body.space === "string" &&
    typeof body.token === "string" &&
    body.token.length <= 512
  );
}

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}
