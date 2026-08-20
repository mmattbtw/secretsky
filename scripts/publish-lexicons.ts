import { publishLexicons } from "../lib/lexicon-publisher";

try {
  await publishLexicons();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
