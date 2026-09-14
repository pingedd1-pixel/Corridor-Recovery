process.env.TZ ||= "America/Vancouver";
import { openDb, migrate } from "./index.js";
const db = await openDb();
const applied = await migrate(db, console.log);
console.log(applied.length ? `applied ${applied.length} migration(s)` : "schema up to date");
await db.close();
