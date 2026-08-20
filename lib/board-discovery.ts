import { boardUri } from "./config";
import { discoverBoard } from "./sync/client";

export function discoverBoardForDid(ownerDid: string): Promise<boolean> {
  return discoverBoard(boardUri(ownerDid));
}
