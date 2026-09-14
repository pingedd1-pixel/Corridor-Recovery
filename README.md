# Corridor Recovery — desk
Tariff-recovery desk: ingest customs entries → classify and phase → deadlines and tasks → findings sheets → licensed brokers file. Read `CLAUDE.md` first, then `docs/BUILD_SPEC.md`. Prototype (functional reference): open `prototype/desk-v0.2.html` in a browser and click "Load demo data".

Layout: `docs/` spec, plan, playbook, fixtures · `prototype/` reference apps · `brand/` guide + logo set · `vault-mirror/` strategy docs (read-only copies; the vault is the source) · `src/` the app (M1 onward) · `test/` acceptance tests · `.github/` PR template.

## Run (M1)
Stack: Node ≥ 22 · Fastify · Postgres (embedded PGlite for dev/tests, no install needed) · the prototype's vanilla UI.

```bash
npm install
npm test          # engine acceptance test on docs/fixtures-sim-broker-entry-report.csv + schema tests
npm run golden    # regenerate the parity fixture FROM the prototype (headless) — never edit the golden JSON by hand
npm run dev       # http://127.0.0.1:3000 — Entries tab → "Load simulation fixture"
```

Set `DATABASE_URL` (see `.env.example`) to run on a real Postgres; migrations in `src/db/migrations/` apply on start or via `npm run migrate`. The engine's "today" and all deadline math run in `TZ=America/Vancouver`.

`src/engine/` is the prototype's engine ported verbatim (`classify`, `phase`, `clientStats`, `tasks`, `findings`, plus the dashboard arithmetic); rules and "today" are parameters. `src/db/` schema, migrations, rules-as-of-date. `src/ingest/` CSV auto-mapping. `src/services/state.js` maps rows ↔ engine objects and stores every computed figure with its rule version. `src/documents/` the five client documents on the Corridor template (findings sheet, cover note, engagement letter, authorization, bucket-B intro) with CM-TYPE-YYYY-NNN references, HTML → PDF via Playwright (`DOCUMENTS_DIR`, default `./data/documents`). `src/server.js` the API + static UI in `src/public/`.
