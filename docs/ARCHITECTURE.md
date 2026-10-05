# Architecture

Universal Master SKU management for Oakcraft Furniture. This document explains how the system is
built and why, in the order the requirements asked for.

## 1. Overall architecture

```
Browser (React screens)
      │  JSON over HTTPS, session cookie
      ▼
Next.js API routes        src/app/api/**      authentication, permission check, same-origin check
      │
      ▼
Service layer             src/server/*.ts     every business rule lives here, once
      │  parameterised SQL (pg)
      ▼
PostgreSQL                db/migrations       tables, constraints, indexes
```

- One deployable application. No separate backend to run, no message queue, no cache server.
- Screens never talk to the database and never hold more than one page of rows. Every list is
  paginated, filtered, sorted and searched in SQL.
- The service layer has no UI code, so the same functions are used by the API, the seed scripts and
  the tests.
- No ORM: the SQL is written out, always with bound parameters. Sort keys come from fixed whitelists.

## 2. Database schema

`db/migrations/001_init.sql` is the source of truth and is commented throughout.

| Table | What it holds | Key rules |
|---|---|---|
| `master_products` | One row per real product | `master_sku` unique (case-insensitive), for ever, including deleted rows |
| `master_product_images` | Additional product images | |
| `platforms` | Amazon, Flipkart, anything added later | name and code unique; status Active / Inactive / Archived |
| `platform_fields` | Custom fields of a platform | field type, required, searchable, sortable, "is the Product ID", "use for matching" |
| `platform_import_templates` | Saved column mapping per platform | header row, first data row, column → field map |
| `platform_listings` | One row per marketplace Child SKU | unique on (platform, child_sku), exact and case-sensitive; `master_product_id` nullable; keeps the full original import row in `raw_data` |
| `platform_listing_custom_values` | Values of custom fields | composite foreign keys guarantee a value belongs to a field of the listing's own platform |
| `import_files`, `import_logs`, `import_rows` | The uploaded file, the run, and the outcome of every row | rows that could not become listings are still recorded with their data |
| `mapping_history` | Every map / re-map / un-map / auto-map | old and new Master SKU, method, confidence, user |
| `audit_logs` | Who did what and when | old and new values as JSON |
| `users`, `sessions` | Accounts and sign-ins | bcrypt password hashes; only a hash of the session token is stored |
| `settings` | Matching thresholds, permissions, platform types | |
| `media` | Uploaded images | type checked by file signature; SVG refused |

A CHECK constraint ties the two mapping columns together, so the database itself refuses
inconsistent rows:

- `MAPPED` must have a Master SKU
- `UNMAPPED` and `NEEDS_REVIEW` must not
- `REMAPPING_REQUIRED` may keep its current Master SKU until someone corrects it

Indexes: unique and lookup B-trees on the identifiers, partial indexes for the queues
(`mapping_status`, `platform_id` where not deleted), and trigram (GIN) indexes on a denormalised
`search_text` column for listings and for Master SKUs, which is what makes "contains" search fast.

## 3. Master SKU → Platform → Child SKU

```
master_products 1 ──── * platform_listings * ──── 1 platforms
                              │ 1
                              * platform_listing_custom_values * ──── 1 platform_fields
```

A listing belongs to exactly one platform and to at most one Master SKU. A Master SKU can have any
number of listings on any number of platforms, including several on the same platform (for example
an FBA SKU and a self-ship SKU on one ASIN). A listing without a Master SKU is valid; that is what
"unmapped" means.

## 4. Dynamic platforms

No marketplace is named anywhere in the application code or the table structure. Amazon and
Flipkart are two rows created by `scripts/seed.ts` through the same `createPlatform()` call the
"Add platform" screen uses.

Everything that mentions platforms reads the `platforms` table at request time: the import
dropdown, listing filters, Master SKU list columns, coverage, missing-platform report, dashboard
table, comparison view, the per-platform reports in the report list, consolidated export columns,
and Excel mapping. Coverage counts **active** platforms, so deactivating a platform takes it out of
"3 / 5" without touching its listings.

## 5. Custom fields

- **Standard fields** are columns on every listing: Child SKU, Seller SKU, Listing Name, Product
  Title, Product ID, Listing ID, Listing URL, Variant, Color, Size, Status, Remarks.
- **Custom fields** are rows in `platform_fields`; their values are rows in
  `platform_listing_custom_values`. Adding "Style ID" to Myntra inserts one row and changes no table.
- One custom field per platform can be marked as **the platform's Product ID** (ASIN, FSN, Style
  ID). Its value is mirrored into the standard `product_id` column, so every platform has a
  comparable identifier for tables, search and exports.
- **Searchable** fields are folded into the listing's `search_text`, so global search finds them.
- **Use for matching** marks identifiers where one value always means one product; automatic
  matching may rely on those.
- A platform may also define a **listing link pattern** such as
  `https://www.amazon.in/dp/{product_id}`, used for "Open listing" when a listing has no URL of its own.

## 6. Import

```
select platform → upload → map columns → check → confirm → summary
```

1. **Upload.** Extension, size and file signature are checked; the original file is stored.
2. **Map columns.** The sheet, header row and first data row are detected (and editable). Columns
   are pre-mapped from the platform's saved template; without one they are guessed from header
   names and from the platform's custom field labels. Unmapped columns are not lost: the whole
   original row is kept with the listing.
3. **Check.** The file is analysed exactly as it will be imported and nothing is written: total,
   potentially mapped, unmapped, needs review, duplicates, errors, with sample rows for each.
4. **Confirm.** The same analysis runs again inside one transaction and is written in bulk.
   Either the whole file is imported or none of it.
5. **Summary** with links to the mapped, unmapped and needs-review rows and a downloadable report.

What happens to each row:

| Row | Result |
|---|---|
| Child SKU not seen before on this platform | new listing; automatic matching decides its mapping status |
| Child SKU already exists | listing is refreshed; empty cells never blank out stored values; **a mapping made earlier is never touched** |
| Child SKU exists but was deleted in the CRM | listing is restored with its mapping, and the restore is audited |
| Same Child SKU twice in one file | first row is used, later rows are recorded as duplicates |
| No Child SKU at all | recorded as an error row with its data; it cannot become a listing |

The only way a row fails to become a listing is having no Child SKU.

## 7. Automatic matching

`src/server/matching.ts`. Signals, strongest first:

| Signal | Confidence |
|---|---|
| The file itself names a Master SKU | 100 |
| Child or Seller SKU is identical to a Master SKU or internal code | 100 |
| The exact same SKU is already mapped on another platform | 97 |
| The same Product ID is already mapped on this platform | 95 |
| A custom identifier marked "use for matching" is already mapped | 93 |
| Same SKU with different capitalisation on another platform | 88 |
| Model, product name and colour of a Master SKU found in the listing title or SKU | up to 95 |

Decision (thresholds are in Settings; defaults 90 and 50):

- at or above the auto-map threshold → **Mapped**
- at or above the review threshold → **Needs Review**, with the suggestion and the reason stored
- below → **Unmapped**

Safeguards against forcing a wrong match:

- Two strong signals pointing at different Master SKUs → Needs Review, never a guess.
- A name-based match is capped below the auto-map threshold unless the Master SKU's **model** is
  found and its **colour** is confirmed with no other colour mentioned. A second Master SKU scoring
  within 8 points also blocks auto-mapping.
- A Master SKU that a person removed from a listing, or rejected as a suggestion, is remembered on
  that listing and never proposed for it again.
- Matching only ever writes to listings that are Unmapped or in Needs Review.

Name scoring weighs words by how rare they are across Master SKUs, ignores the brand names listed in
Settings, tolerates one-letter spelling slips in the model ("Metrix", "Huricane") as a weaker hit, and
understands common colour abbreviations.

## 8. Unmapped SKU workflow

1. An unmatched listing is saved like any other, with status Unmapped.
2. **Unmapped SKUs** lists them with platform, age and filters; the sidebar and dashboard show the
   count, broken down per platform.
3. **Map** opens the listing with the system's suggestions (confidence and reason) and a search
   that finds Master SKUs by code, product name, model, or any Child SKU or listing already linked.
4. **Confirm mapping** locks and updates that one row: Master SKU set, status Mapped. No second row
   is created. The change goes to `mapping_history` and the audit log.
5. If other unmapped listings share the same SKU or Product ID, the app offers to map them too.
6. The listing is immediately part of the Master SKU's page, coverage and reports.

Also available: create a Master SKU directly from one or several unmapped listings, map many
listings to one Master SKU, a grid that gives each listing its own Master SKU, Excel round-trip
mapping, change Master SKU, flag as "Re-mapping required", and remove a mapping.

## 9. Screens

Sidebar: Dashboard · Master SKUs · All Listings · E-Commerce Platforms · SKU Mapping · Unmapped SKUs
· Needs Review · Import Data · Reports · Audit Logs · Users · Settings. A search box on every screen
finds any identifier and leads to its Master SKU.

The Master SKU page is the centre: product header and image, coverage ("3 / 5, missing: Meesho,
GeM"), one group of listing cards per connected platform, a side-by-side comparison table, and the
change history.

## Security

- Passwords hashed with bcrypt (cost 12). Five wrong attempts lock an account for 15 minutes.
- Sessions are random 256-bit tokens in an HttpOnly, SameSite=Lax cookie; the database stores only
  their SHA-256. Deactivating a user or resetting a password ends their sessions at once.
- Every API route goes through one guard (`src/server/http.ts`): signed-in user, role permission,
  and an Origin check on anything that changes data.
- All SQL is parameterised. URLs accepted from users must be http(s). Uploads are limited in size
  and checked by file signature. CSV exports neutralise spreadsheet formulas.
- Deletion is always soft; listings of a deleted Master SKU are flagged "Re-mapping required"
  rather than orphaned, and come back when it is restored.

## What was verified

Against a real PostgreSQL 16 database and the production build:

- `scripts/e2e-test.ts`: 127 checks over HTTP covering the 25 required test cases, the new-platform
  scenario (create platform, add fields, import, unmapped, manual map, coverage, reports), roles,
  and the two real marketplace files (372 Amazon and 297 Flipkart rows, none lost).
- A browser-driven pass over the interactive screens (47 checks): forms, dialogs, row menus, bulk
  actions, the import wizard, Excel mapping, uploads and downloads, and role-based visibility.
- A load test with 5,000 Master SKUs and a 100,000-row file on a 2-core machine: check 7 s, import
  31 s, re-import 28 s; afterwards dashboard 0.15 s, listing pages and searches 0.1–0.2 s.

## Known limits

- Imports run inside the request. That is comfortable up to a few hundred thousand rows per file;
  beyond that, split the file (the limit is `MAX_IMPORT_ROWS`).
- The Docker image was not built in the development environment; the Node.js + PostgreSQL route was.
- The `xlsx` dependency has an open advisory on npm; see the README for the one-line upgrade.
- There is no "forgot password" email. An admin resets passwords from Users.
- Stock, price and order data are out of scope. Prices that appear in marketplace files can be kept
  as custom fields, and every original row is preserved in full.
