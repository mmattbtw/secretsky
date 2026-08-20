import { getConfig } from "../lib/config";
import { migrate } from "../lib/db/migrations";
import { publishLexicons } from "../lib/lexicon-publisher";
import { SyncService } from "../lib/sync/service";

const config = getConfig();
await migrate();
if (config.publishLexicons) await publishLexicons();

const service = new SyncService({
  internalUrl: config.syncInternalUrl,
  managingAppService: config.managingAppService,
  pollInterval: config.syncPollInterval,
});

await service.start();
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  await service.close();
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => void close());
}
