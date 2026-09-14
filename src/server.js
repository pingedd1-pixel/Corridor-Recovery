process.env.TZ ||= "America/Vancouver";
import { openDb, migrate } from "./db/index.js";
import { buildApp } from "./app.js";
import { fmt, today } from "./engine/index.js";

const db = await openDb();
await migrate(db, m => console.log("migrate:", m));
const app = await buildApp(db);
const port = Number(process.env.PORT || 3000), host = process.env.HOST || "127.0.0.1";
await app.listen({ port, host });
console.log(`Corridor Recovery desk on http://${host}:${port} (db: ${db.kind}, as of ${fmt(today())})`);
