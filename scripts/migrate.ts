import { migrate } from "../lib/db/migrations";

await migrate();
console.log("database is ready");
