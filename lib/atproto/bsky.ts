import { Client } from "@atproto/lex-client";
import { getConfig } from "../config";

let client: Client | undefined;

export function getBskyClient(): Client {
  client ??= new Client({
    service: getConfig().bskyUrl,
    fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
  });
  return client;
}
