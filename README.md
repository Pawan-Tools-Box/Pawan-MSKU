# Oakcraft Master SKU CRM

One permanent internal **Master SKU** for every real Oakcraft product, with every marketplace
**Child SKU** (Amazon, Flipkart, and any platform you add later) linked underneath it.

```
OC-MATRIX-001  Matrix Ergonomic Office Chair
├─ Amazon     MATRIX-BLK-01    ASIN B0MATRIX001
├─ Flipkart   FK-MATRIX-BLK    FSN  FSNMATRIX001
└─ Myntra     MY-MATRIX-BLK    Style ID MY12345
```

Platforms are configuration, not code. An admin adds a platform, its custom fields and its import
template from the screen; nothing in the source or the database structure changes.

- Stack: Next.js 16 (React 19, TypeScript), Node.js API routes, PostgreSQL 13+
- **Put it on GitHub and make it live: [DEPLOY.md](DEPLOY.md)** (no installation needed)
- Full design notes: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Screenshots of every module: [docs/screenshots](docs/screenshots)

---

## 1. Start it

To put the CRM online without installing anything, follow [DEPLOY.md](DEPLOY.md). The options
below are for running it on your own computer or server.

### Option A: Docker (simplest)

You need Docker Desktop (or Docker Engine with Compose).

```bash
docker compose up -d --build
```

Open http://localhost:3000 and sign in with `admin@oakcraft.in` / `ChangeMe@123`.
The app asks you to set your own password straight away.

Before using it for real, create a file named `.env` next to `docker-compose.yml`:

```
DB_PASSWORD=a-long-random-database-password
ADMIN_EMAIL=you@oakcraft.in
ADMIN_PASSWORD=A-temporary-password-1
```

The database lives in the Docker volume `oakcraft_pgdata` and survives restarts and rebuilds.

> The Docker files were written carefully but could not be built in the environment this project
> was developed in (no Docker daemon there). Option B below was run and tested end to end.

### Option B: Node.js and PostgreSQL directly

You need Node.js 20.9 or newer and PostgreSQL 13 or newer.

```bash
# 1. create an empty database
createdb oakcraft_crm

# 2. configure
cp .env.example .env          # then edit DATABASE_URL and the admin details

# 3. install, create tables, add the first admin and the Amazon/Flipkart platforms
npm install
npm run db:setup

# 4. build and run
npm run build
npm start                     # http://localhost:3000
```

`npm run db:setup` is safe to run again at any time: migrations apply once, and existing users,
platforms and settings are never overwritten.

The database user needs permission to run `CREATE EXTENSION pg_trgm` (the database owner can, on
PostgreSQL 13+). It powers fast "contains" search.

### Optional demo data

```bash
npm run db:seed:demo
```

Adds the examples from the requirements (OC-MATRIX-001 on Amazon, Flipkart and Myntra, one unmapped
Amazon SKU, and empty Meesho and GeM platforms so coverage reads 3 / 5). Do not run it on the live
database.

---

## 2. First hour: getting your real data in

Your two files are in `sample-data/`. Amazon and Flipkart already have import templates that match
them exactly.

1. **Import Data** → choose *Amazon* → drop `Amazon.xlsx` → *Check file* → *Confirm import*.
2. Repeat with *Flipkart* and `Flipkart.xls`. (The template skips Flipkart's description row.)
3. Open **Unmapped SKUs**. You have no Master SKUs yet, so everything is here. For each product:
   tick its listings → **Create Master SKU from selection**. Give it a Master SKU, a short **Model**
   and a **Color**; these two fields are what automatic matching uses.
   Or prepare all Master SKUs in Excel first: **Master SKUs → Import from Excel** (a template is
   offered there).
4. Press **Re-run auto-match**. Listings that share a SKU or a Product ID with something you mapped
   are mapped for you; likely matches go to **Needs Review** with a confidence score.
5. For the rest use **SKU Mapping**: a grid for many rows at once, or download the Excel sheet, fill
   in *New Master SKU* and upload it.

From then on, each new marketplace export is three clicks, and only genuinely new SKUs need a decision.

### Adding a new platform (no developer needed)

**E-Commerce Platforms → Add platform**. Enter the name and code, add any identifiers that platform
has (for example *Style ID*; tick "This is the platform's Product ID" on the main one) and save.
The platform is immediately available in imports, listings, coverage, reports, exports and search.
The first import asks you to map the file's columns once and remembers the mapping.

---

## 3. What each role can do

| | Admin | Staff | Viewer |
|---|---|---|---|
| Search and view everything | yes | yes | yes |
| Add and edit listings, map and re-map, resolve Unmapped | yes | yes | no |
| Import marketplace files | yes | if allowed in Settings | no |
| Export reports | yes | if allowed in Settings | if allowed in Settings |
| Create and edit Master SKUs | yes | if allowed in Settings | no |
| Delete and restore (always a soft delete) | yes | no | no |
| Platforms, custom fields, users, settings, audit log | yes | no | no |

New users, and users whose password an admin resets, are asked to choose their own password at
their next sign-in.

---

## 4. Running it properly

- **HTTPS.** Put the app behind a reverse proxy (Nginx, Caddy, a cloud load balancer) that
  terminates HTTPS and forwards `X-Forwarded-Proto` and `Host`. The session cookie is marked
  `Secure` automatically for HTTPS requests; `COOKIE_SECURE=true` forces it.
- **Proxy limits.** Allow uploads up to `MAX_UPLOAD_MB` (default 30) and a read timeout of about
  120 seconds. A 100,000-row import takes roughly 30 seconds; a few hundred rows take well under a second.
- **Backups.** Everything, including uploaded files and images, is in PostgreSQL:
  `pg_dump -Fc oakcraft_crm > oakcraft_crm-$(date +%F).dump`, restore with `pg_restore`.
  With Docker: `docker compose exec db pg_dump -U oakcraft -Fc oakcraft_crm > backup.dump`.
- **Updates.** Replace the code, then `npm install && npm run db:setup && npm run build && npm start`
  (or `docker compose up -d --build`). New migrations in `db/migrations/` are applied automatically.

### Environment variables

| Variable | Purpose | Default |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | required |
| `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` | First admin, created only when no user exists | Admin, admin@oakcraft.in, ChangeMe@123 |
| `COOKIE_SECURE` | `true` / `false` to force the cookie's Secure flag; unset = follow the request (HTTPS → Secure) | unset |
| `MAX_UPLOAD_MB` | Largest marketplace file accepted | 30 |
| `MAX_IMPORT_ROWS` | Largest sheet accepted, in rows | 300000 |
| `PG_POOL_MAX` | Database connections per app process | 10 |

### One known dependency advisory

Excel files are read with the `xlsx` package (SheetJS), needed because Flipkart exports the old
`.xls` format. The newest version on the npm registry is 0.18.5, and `npm audit` reports two advisories
for it (prototype pollution and a slow regular expression, both triggered by a deliberately crafted
file). Only signed-in users with import or mapping permission can upload files, uploads are size- and
row-limited, and sort and filter keys are whitelisted. The publisher's fixed build is not on npm; to
switch to it, run once on a machine with internet access:

```bash
npm install https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz
npm run build
```

---

## 5. Tests

`scripts/e2e-test.ts` drives the running app over HTTP, exactly as the browser does. It covers the 25
required test cases, the "new platform without a developer" scenario, the three roles, and imports
of the two real files in `sample-data/`.

```bash
createdb oakcraft_crm_test
DATABASE_URL=postgres://…/oakcraft_crm_test npm run db:setup
DATABASE_URL=postgres://…/oakcraft_crm_test PORT=3100 npm start &
BASE_URL=http://localhost:3100 npm run test:e2e
```

Use an empty test database: the script creates platforms, Master SKUs and listings.

---

## 6. Where things are

```
db/migrations/001_init.sql   every table, index and constraint, with comments
scripts/                     migrate, seed, seed-demo, e2e-test
src/server/                  all business rules (no UI code)
  matching.ts                automatic Master SKU matching and confidence
  imports.ts                 upload → preview → commit pipeline
  listings.ts                listings, mapping, re-mapping, bulk mapping
  masters.ts, platforms.ts   Master SKUs; platforms, custom fields, import templates
  reports.ts, search.ts      reports and exports; global search
  auth.ts, http.ts           sessions, roles, request guard
src/app/api/                 REST endpoints (thin wrappers around src/server)
src/app/(app)/               the twelve screens in the sidebar
src/components/              shared UI: tables, dialogs, pickers
sample-data/                 the Amazon and Flipkart exports this was built against
```
