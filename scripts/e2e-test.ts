/**
 * End-to-end test of the 25 required test cases plus the "new platform without a developer" demo.
 * Talks to a running server over HTTP exactly as the browser does.
 *
 *   1. Point DATABASE_URL at an EMPTY test database, then: npm run db:setup
 *   2. Start the app against that database:              npm run build && npm start   (or npm run dev)
 *   3. Run:                                              npm run test:e2e
 *
 * BASE_URL defaults to http://localhost:3000. Never run this against your live database:
 * it creates test platforms, Master SKUs and listings.
 */
import "dotenv/config";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import * as XLSX from "xlsx";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@oakcraft.in";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "ChangeMe@123";

let passed = 0;
const failures: string[] = [];
function check(name: string, cond: unknown, detail?: unknown) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failures.push(name); console.log(`  ✗ ${name}${detail !== undefined ? `  →  ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`); }
}
const section = (t: string) => console.log(`\n${t}`);

class Client {
  cookie = "";
  async raw(method: string, path: string, body?: unknown, form?: FormData): Promise<Response> {
    const headers: Record<string, string> = { Origin: BASE };
    if (this.cookie) headers.Cookie = this.cookie;
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const res = await fetch(BASE + path, { method, headers, body: form ?? (body !== undefined ? JSON.stringify(body) : undefined), redirect: "manual" });
    const set = res.headers.getSetCookie?.() ?? [];
    for (const c of set) if (c.startsWith("oc_session=")) this.cookie = c.split(";")[0];
    return res;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async call(method: string, path: string, body?: unknown, form?: FormData): Promise<{ status: number; data: any }> {
    const res = await this.raw(method, path, body, form);
    const text = await res.text();
    let data: unknown = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    return { status: res.status, data };
  }
  get = (p: string) => this.call("GET", p);
  post = (p: string, b: unknown = {}) => this.call("POST", p, b);
  patch = (p: string, b: unknown) => this.call("PATCH", p, b);
  del = (p: string) => this.call("DELETE", p);
  async upload(path: string, fields: Record<string, string>, fileName: string, data: Buffer) {
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) form.set(k, v);
    form.set("file", new File([new Uint8Array(data)], fileName));
    return this.call("POST", path, undefined, form);
  }
  async download(path: string): Promise<{ status: number; buf: Buffer; type: string | null }> {
    const res = await this.raw("GET", path);
    return { status: res.status, buf: Buffer.from(await res.arrayBuffer()), type: res.headers.get("content-type") };
  }
  async login(email: string, password: string) { return this.post("/api/auth/login", { email, password }); }
}

function csv(rows: (string | number)[][]): Buffer {
  return Buffer.from(rows.map((r) => r.map((c) => (/[",\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : String(c))).join(",")).join("\n"), "utf8");
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sheetRows(buf: Buffer, sheet = 0): any[] {
  const wb = XLSX.read(buf, { type: "buffer" });
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[sheet]], { defval: "" });
}

async function runImport(c: Client, platformId: number, fileName: string, data: Buffer, tweak?: (cfg: { columnMap: Record<string, string> }) => void) {
  const up = await c.upload("/api/imports", { platformId: String(platformId) }, fileName, data);
  if (up.status !== 200) return { up, preview: null, commit: null };
  const config = up.data.config;
  tweak?.(config);
  const preview = await c.post(`/api/imports/${up.data.import.id}/preview`, { config });
  if (preview.status !== 200) return { up, preview, commit: null };
  const commit = await c.post(`/api/imports/${up.data.import.id}/commit`, { saveTemplate: true });
  return { up, preview, commit };
}

async function main() {
  const admin = new Client();
  const suffix = Date.now().toString(36).toUpperCase().slice(-4);

  section("Security and sign-in");
  check("Unauthenticated API call is rejected (401)", (await new Client().get("/api/masters")).status === 401);
  check("Wrong password is rejected", (await new Client().login(ADMIN_EMAIL, "wrong-password")).status === 401);
  const li = await admin.login(ADMIN_EMAIL, ADMIN_PASSWORD);
  check("Admin can sign in", li.status === 200 && li.data.user.role === "ADMIN", li.data);
  const cross = await fetch(BASE + "/api/masters", { method: "POST", headers: { Cookie: admin.cookie, Origin: "https://evil.example", "Content-Type": "application/json" }, body: "{}" });
  check("Cross-site POST is blocked (403)", cross.status === 403);

  const platforms0 = (await admin.get("/api/platforms?fields=1")).data.platforms;
  const amazon = platforms0.find((p: { platform_code: string }) => p.platform_code === "AMAZON");
  const flipkart = platforms0.find((p: { platform_code: string }) => p.platform_code === "FLIPKART");
  check("Amazon and Flipkart exist as configured platforms (seed data, not code)", amazon && flipkart);

  section("1. Create Master SKU");
  const M1 = `OC-MATRIX-${suffix}1`, M2 = `OC-MATRIX-${suffix}2`, M3 = `OC-HURRICANE-${suffix}`;
  const m1 = await admin.post("/api/masters", { master_sku: M1, product_name: "Matrix Ergonomic Office Chair", model: "Matrix", category: "Office Chair", brand: "Oakcraft", color: "Black" });
  check("Master SKU created", m1.status === 200 && m1.data.master.master_sku === M1, m1.data);
  const m2 = await admin.post("/api/masters", { master_sku: M2, product_name: "Matrix Visitor Chair", model: "Matrix Visitor", category: "Visitor Chair", color: "Black" });
  const m3 = await admin.post("/api/masters", { master_sku: M3, product_name: "Hurricane Ergonomic Office Chair", model: "Hurricane", category: "Office Chair", color: "Black" });
  check("More Master SKUs created", m2.status === 200 && m3.status === 200);
  const m1dup = await admin.post("/api/masters", { master_sku: M1.toLowerCase(), product_name: "Duplicate" });
  check('Duplicate Master SKU rejected with "Master SKU already exists."', m1dup.status === 409 && m1dup.data.error === "Master SKU already exists.", m1dup.data);
  const master1 = m1.data.master.id, master2 = m2.data.master.id, master3 = m3.data.master.id;

  section("2–3. Add Amazon and Flipkart listings");
  const asinField = amazon.fields.find((f: { field_name: string }) => f.field_name === "asin");
  const fsnField = flipkart.fields.find((f: { field_name: string }) => f.field_name === "fsn");
  const A_SKU = `MATRIX-BLK-${suffix}`, F_SKU = `FK-MATRIX-BLK-${suffix}`, ASIN = `B0MTX${suffix}1`, FSN = `FSNMTX${suffix}1`;
  const la = await admin.post("/api/listings", { platform_id: amazon.id, master_product_id: master1, child_sku: A_SKU, listing_name: "Oakcraft Matrix Ergonomic Office Chair", custom: { [asinField.id]: ASIN } });
  check("Amazon listing added and mapped", la.status === 200 && la.data.listing.mapping_status === "MAPPED" && la.data.listing.master_sku === M1, la.data);
  check("ASIN custom field stored and mirrored as Product ID", la.data.listing?.custom?.[asinField.id] === ASIN && la.data.listing?.product_id === ASIN);
  const lf = await admin.post("/api/listings", { platform_id: flipkart.id, master_product_id: master1, child_sku: F_SKU, listing_name: "Oakcraft Matrix Office Chair Black", custom: { [fsnField.id]: FSN } });
  check("Flipkart listing added and mapped", lf.status === 200 && lf.data.listing.mapping_status === "MAPPED", lf.data);

  section("4–5. Add a future platform and its custom fields (no code changes)");
  const MY = `MYNTRA${suffix}`;
  const np = await admin.post("/api/platforms", { platform_name: `Myntra ${suffix}`, platform_code: MY, platform_type: "Marketplace", website_url: "https://www.myntra.com", status: "ACTIVE" });
  check("Admin creates Myntra platform", np.status === 200 && np.data.platform.platform_code === MY, np.data);
  const myntra = np.data.platform.id;
  check("Duplicate platform code rejected", (await admin.post("/api/platforms", { platform_name: "Another", platform_code: MY })).status === 409);
  check("Duplicate platform name rejected", (await admin.post("/api/platforms", { platform_name: `myntra ${suffix}`, platform_code: `X${suffix}` })).status === 409);
  const f1 = await admin.post(`/api/platforms/${myntra}/fields`, { field_label: "Style ID", field_type: "text", required: false, is_primary_identifier: true, use_for_matching: true });
  const f2 = await admin.post(`/api/platforms/${myntra}/fields`, { field_label: "Article ID", field_type: "text", required: false });
  check("Custom fields Style ID and Article ID added", f1.status === 200 && f2.status === 200, [f1.data, f2.data]);
  check("Standard field names cannot be re-added as custom fields", (await admin.post(`/api/platforms/${myntra}/fields`, { field_label: "Child SKU" })).status === 400);
  const styleField = f1.data.field.id, articleField = f2.data.field.id;

  section("6–9. Import a marketplace file; automatic matching; unmatched SKUs are retained");
  const MY_SAME = A_SKU;                       // same SKU as the mapped Amazon listing → exact cross-platform signal
  const MY_FUZZY = `MY-HURRICANE-BLK-${suffix}`; // name/model/colour match
  const MY_NEW = `MY-BEANBAG-${suffix}`;         // nothing to match
  const myFile = csv([
    ["Seller SKU", "Product Title", "Style ID", "Article ID", "Status"],
    [MY_SAME, "Oakcraft Matrix Office Chair", `MY${suffix}45`, `ART${suffix}1`, "Active"],
    [MY_FUZZY, "Oakcraft Hurricane Ergonomic Office Chair Black", `MY${suffix}46`, `ART${suffix}2`, "Active"],
    [MY_NEW, "Oakcraft Bean Bag XXL Without Beans", `MY${suffix}47`, `ART${suffix}3`, "Inactive"],
    [MY_NEW, "Oakcraft Bean Bag XXL duplicate row", `MY${suffix}48`, `ART${suffix}4`, "Active"],
    ["", "Row without a SKU", `MY${suffix}49`, "", "Active"],
  ]);
  const badPlatform = await admin.upload("/api/imports", { platformId: "999999" }, "x.csv", myFile);
  check('Invalid platform rejected with "Please select a valid platform."', badPlatform.status === 400 && badPlatform.data.error === "Please select a valid platform.", badPlatform.data);
  const badFile = await admin.upload("/api/imports", { platformId: String(myntra) }, "x.exe", Buffer.from("MZ"));
  check("Non-spreadsheet upload rejected", badFile.status === 400);

  const up = await admin.upload("/api/imports", { platformId: String(myntra) }, "myntra-listings.csv", myFile);
  check("File uploaded and columns detected", up.status === 200 && up.data.headers.length === 5, up.data);
  const cmap = up.data.config.columnMap;
  check("Columns auto-mapped, including the platform's custom fields", cmap["Seller SKU"] === "child_sku" && cmap["Product Title"] === "listing_name" && cmap["Style ID"] === "cf:style_id" && cmap["Article ID"] === "cf:article_id" && cmap["Status"] === "listing_status", cmap);
  const noSku = await admin.post(`/api/imports/${up.data.import.id}/preview`, { config: { ...up.data.config, columnMap: { "Product Title": "listing_name" } } });
  check('Missing Child SKU mapping rejected with "Required Child SKU field could not be identified."', noSku.status === 400 && String(noSku.data.error).startsWith("Required Child SKU field could not be identified."), noSku.data);
  const pv = await admin.post(`/api/imports/${up.data.import.id}/preview`, { config: up.data.config });
  check("Validation preview: 5 records, 1 duplicate, 1 error", pv.status === 200 && pv.data.counts.total === 5 && pv.data.counts.duplicates === 1 && pv.data.counts.errors === 1, pv.data?.counts ?? pv.data);
  const before = (await admin.get(`/api/listings?platformId=${myntra}`)).data.total;
  check("Preview writes nothing", before === 0, before);
  const cm = await admin.post(`/api/imports/${up.data.import.id}/commit`, { saveTemplate: true });
  check("Import confirmed", cm.status === 200 && cm.data.counts.new === 3, cm.data);
  check("Committing the same import twice is refused", (await admin.post(`/api/imports/${up.data.import.id}/commit`, {})).status === 400);

  const myList = (await admin.get(`/api/listings?platformId=${myntra}&pageSize=50`)).data.rows as { id: number; child_sku: string; mapping_status: string; master_sku: string | null; suggested_master_sku: string | null; mapping_confidence: number | null; custom: Record<string, string>; product_id: string; listing_status: string }[];
  const same = myList.find((l) => l.child_sku === MY_SAME)!, fuzzy = myList.find((l) => l.child_sku === MY_FUZZY)!, fresh = myList.find((l) => l.child_sku === MY_NEW)!;
  check("7. High confidence (same SKU mapped on Amazon) → MAPPED automatically", same?.mapping_status === "MAPPED" && same.master_sku === M1 && same.mapping_confidence === 97, same);
  check("7. Name/model/colour match is scored, never forced", fuzzy && ((fuzzy.mapping_status === "MAPPED" && fuzzy.master_sku === M3) || (fuzzy.mapping_status === "NEEDS_REVIEW" && fuzzy.suggested_master_sku === M3)), fuzzy);
  check("8. No match → UNMAPPED", fresh?.mapping_status === "UNMAPPED" && fresh.master_sku === null, fresh);
  check("9. Unmatched SKU is retained and listed in Unmapped SKUs", ((await admin.get(`/api/listings?mappingStatus=UNMAPPED&platformId=${myntra}`)).data.rows as { child_sku: string }[]).some((l) => l.child_sku === MY_NEW));
  check("Custom field values imported (Style ID mirrored to Product ID, Article ID kept)", fresh?.custom?.[styleField] === `MY${suffix}47` && fresh.product_id === `MY${suffix}47` && fresh.custom[articleField] === `ART${suffix}3`, fresh);
  check("Marketplace status normalised (Inactive)", fresh?.listing_status === "INACTIVE");
  const irows = (await admin.get(`/api/imports/${up.data.import.id}/rows?pageSize=50`)).data.rows as { outcome: string; child_sku: string | null }[];
  check("Duplicate and error rows are recorded in the import, not silently dropped", irows.length === 5 && irows.filter((r) => r.outcome === "DUPLICATE").length === 1 && irows.filter((r) => r.outcome === "ERROR").length === 1, irows);
  const tpl = (await admin.get(`/api/platforms/${myntra}/templates`)).data.templates;
  check("Column mapping saved as this platform's import template", tpl.length === 1 && tpl[0].column_map["Seller SKU"] === "child_sku", tpl);
  const hist = (await admin.get("/api/imports")).data.rows as { id: number; total_records: number; unmapped_records: number }[];
  check("Import appears in import history with counts", hist.some((h) => h.id === up.data.import.id && h.total_records === 5));
  const rep = await admin.download(`/api/imports/${up.data.import.id}/report`);
  check("Import report downloads as Excel", rep.status === 200 && sheetRows(rep.buf, 1).length === 5);

  const again = await runImport(admin, myntra, "myntra-listings.csv", myFile);
  check("Re-importing the same file creates no duplicates and keeps mappings", again.commit?.status === 200 && again.commit.data.counts.new === 0 && again.commit.data.counts.updated === 3 && (await admin.get(`/api/listings?platformId=${myntra}`)).data.total === 3, again.commit?.data);

  section("10–11. Manually map an unmatched SKU; Master SKU page updates");
  const totalBefore = (await admin.get("/api/listings?pageSize=1")).data.total;
  const sug = await admin.get(`/api/listings/${fresh.id}/suggestions`);
  check("Suggestions endpoint responds for the mapping dialog", sug.status === 200 && Array.isArray(sug.data.suggestions));
  const srch = await admin.get(`/api/masters/search?q=${encodeURIComponent(F_SKU)}`);
  check("Master SKU search finds a master by one of its existing Child SKUs", srch.data.masters.some((m: { master_sku: string }) => m.master_sku === M1), srch.data);
  check("Mapping to a missing Master SKU fails clearly", (await admin.post(`/api/listings/${fresh.id}/map`, { masterId: 99999999 })).data.error === "Selected Master SKU does not exist.");
  const mp = await admin.post(`/api/listings/${fresh.id}/map`, { masterId: master1 });
  check("Confirm mapping succeeds", mp.status === 200 && mp.data.changed === true, mp.data);
  const after = (await admin.get(`/api/listings/${fresh.id}`)).data.listing;
  check("Existing record updated: status MAPPED, Master SKU set", after.mapping_status === "MAPPED" && after.master_sku === M1 && after.id === fresh.id, after);
  check("No duplicate listing created by mapping", (await admin.get("/api/listings?pageSize=1")).data.total === totalBefore);
  const md = (await admin.get(`/api/masters/${master1}`)).data;
  check("Listing immediately appears under the Master SKU", (md.listings as { child_sku: string }[]).some((l) => l.child_sku === MY_NEW));
  check("Myntra listing appears under the Master SKU with its Style ID", (md.listings as { platform_id: number; custom: Record<string, string> }[]).some((l) => l.platform_id === myntra && l.custom[styleField]));

  section("12. Change mapping (re-map) with audit history");
  check("Flag as re-mapping required", (await admin.post(`/api/listings/${fresh.id}/request-remap`, { note: "Wrong product" })).status === 200 && (await admin.get(`/api/listings/${fresh.id}`)).data.listing.mapping_status === "REMAPPING_REQUIRED");
  const rm = await admin.post(`/api/listings/${fresh.id}/map`, { masterId: master2 });
  const afterRemap = (await admin.get(`/api/listings/${fresh.id}`)).data.listing;
  check("Master SKU changed", rm.status === 200 && afterRemap.master_sku === M2 && afterRemap.mapping_status === "MAPPED", afterRemap);
  const h = (await admin.get(`/api/listings/${fresh.id}/history`)).data.history as { old_master_sku: string | null; new_master_sku: string | null }[];
  check("Mapping history keeps old and new Master SKU", h.some((x) => x.old_master_sku === M1 && x.new_master_sku === M2), h);

  section("13. Bulk mapping");
  const bulkIds: number[] = [];
  for (const n of [1, 2, 3]) {
    const r = await admin.post("/api/listings", { platform_id: amazon.id, child_sku: `BULK-${suffix}-${n}`, listing_name: `Storage Rack ${n} Tier` });
    bulkIds.push(r.data.listing.id);
  }
  const bad = await admin.post("/api/mapping/bulk", { items: [{ listingId: bulkIds[0], masterSku: M1 }, { listingId: bulkIds[1], masterSku: "DOES-NOT-EXIST" }] });
  check("Bulk mapping validates before saving (invalid Master SKU → nothing saved)", bad.status === 200 && bad.data.ok === false && bad.data.errors.length === 1 && (await admin.get(`/api/listings/${bulkIds[0]}`)).data.listing.mapping_status === "UNMAPPED", bad.data);
  const good = await admin.post("/api/mapping/bulk", { items: [{ listingId: bulkIds[0], masterSku: M1 }, { listingId: bulkIds[1], masterSku: M2 }] });
  check("Save all mappings", good.data.ok === true && good.data.updated === 2, good.data);

  section("14. Excel mapping");
  const sheet = await admin.download(`/api/mapping/excel?platformId=${amazon.id}&mappingStatus=UNMAPPED`);
  const mrows = sheetRows(sheet.buf);
  check("Mapping sheet exports with the required columns", sheet.status === 200 && mrows.length >= 1 && ["Platform", "Child SKU", "Listing Name", "Current Master SKU", "New Master SKU"].every((k) => k in mrows[0]), Object.keys(mrows[0] ?? {}));
  const filled = mrows.map((r) => ({ ...r, "New Master SKU": r["Child SKU"] === `BULK-${suffix}-3` ? M3 : "" }));
  filled.push({ Platform: "Amazon", "Child SKU": "NOT-A-REAL-SKU", "New Master SKU": M3 });
  filled.push({ Platform: "Amazon", "Child SKU": `BULK-${suffix}-1`, "New Master SKU": "NO-SUCH-MASTER" });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filled), "SKU Mapping");
  const filledBuf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const dry = await admin.upload("/api/mapping/excel", {}, "sku-mapping.xlsx", filledBuf);
  check("Uploaded sheet is validated first (1 to update, 2 errors, nothing written)", dry.status === 200 && dry.data.toUpdate === 1 && dry.data.errors.length === 2 && dry.data.applied === false, dry.data);
  const applied = await admin.upload("/api/mapping/excel", { apply: "1" }, "sku-mapping.xlsx", filledBuf);
  check("Valid rows applied", applied.data.updated === 1 && (await admin.get(`/api/listings/${bulkIds[2]}`)).data.listing.master_sku === M3, applied.data);

  section("15. Duplicate detection");
  const dupL = await admin.post("/api/listings", { platform_id: amazon.id, child_sku: A_SKU, listing_name: "dup" });
  check(`Duplicate Child SKU on the same platform rejected, naming the Master SKU`, dupL.status === 409 && dupL.data.error === `This Child SKU is already mapped to Master SKU ${M1}.` && dupL.data.details.existingListingId === la.data.listing.id, dupL.data);
  const caseL = await admin.post("/api/listings", { platform_id: amazon.id, child_sku: A_SKU.toLowerCase(), listing_name: "Different listing whose SKU differs only by case" });
  check("A SKU differing only by capitalisation is a different SKU and is kept", caseL.status === 200, caseL.data);
  const dupReport = (await admin.get("/api/reports/duplicates")).data;
  check("Duplicate SKU report lists look-alike SKUs", dupReport.rows.some((r: { value: string }) => r.value === A_SKU.toLowerCase()), dupReport.rows);

  section("16–18. Search");
  const s1 = (await admin.get(`/api/search?q=${M1}`)).data;
  check("Search by Master SKU", s1.masters.some((m: { master_sku: string }) => m.master_sku === M1));
  const s2 = (await admin.get(`/api/search?q=${encodeURIComponent(F_SKU)}`)).data;
  check("Search by Child SKU returns the linked Master SKU and platform", s2.listings.some((l: { master_sku: string; platform_name: string }) => l.master_sku === M1 && l.platform_name === "Flipkart"), s2.listings);
  const s3 = (await admin.get(`/api/search?q=${ASIN}`)).data;
  check("Search by platform identifier (ASIN) returns the Master SKU", s3.listings.some((l: { master_sku: string }) => l.master_sku === M1));
  const s4 = (await admin.get(`/api/search?q=ART${suffix}1`)).data;
  check("Search by a custom field of the new platform (Article ID) returns the Master SKU", s4.listings.some((l: { master_sku: string; platform_id: number }) => l.master_sku === M1 && l.platform_id === myntra), s4.listings);

  section("19–21. Coverage, missing platforms, and another new platform");
  const cov1 = (await admin.get(`/api/masters/${master1}`)).data.coverage;
  check("Platform coverage is calculated from active platforms", cov1.covered === 3 && cov1.total >= 3, cov1);
  const ME = `MEESHO${suffix}`;
  const meesho = await admin.post("/api/platforms", { platform_name: `Meesho ${suffix}`, platform_code: ME, platform_type: "Marketplace", fields: [{ field_label: "Catalog ID" }] });
  check("Another platform (Meesho) added from the admin API with no code change", meesho.status === 200);
  const cov2 = (await admin.get(`/api/masters/${master1}`)).data.coverage;
  check("Coverage total grows automatically and Meesho is listed as missing", cov2.total === cov1.total + 1 && cov2.missing.some((m: { platform_name: string }) => m.platform_name === `Meesho ${suffix}`), cov2);
  const miss = (await admin.get("/api/reports/missing-platforms?pageSize=500")).data;
  check("Missing platform report names the missing platforms", miss.rows.some((r: { master_sku: string; missing_platforms: string }) => r.master_sku === M1 && r.missing_platforms.includes(`Meesho ${suffix}`)), miss.rows.slice(0, 3));
  const catalog = (await admin.get("/api/reports")).data.reports as { title: string }[];
  check("Platform reports are generated dynamically (Myntra and Meesho reports exist)", catalog.some((r) => r.title === `Myntra ${suffix} report`) && catalog.some((r) => r.title === `Meesho ${suffix} report`));
  const dash = (await admin.get("/api/dashboard")).data;
  check("Dashboard platform table includes the new platforms", dash.platforms.some((p: { platform_code: string }) => p.platform_code === MY) && dash.platforms.some((p: { platform_code: string; listings: number }) => p.platform_code === ME && p.listings === 0));
  const ml = (await admin.get(`/api/masters?q=${M1}`)).data;
  check("Master SKU list carries per-platform columns dynamically", ml.rows[0].platforms[String(myntra)]?.count >= 1 && ml.activePlatforms === cov2.total, ml.rows[0]);
  const myReport = (await admin.get(`/api/reports/platform-${myntra}`)).data;
  check("Myntra report has Style ID and Article ID as columns", myReport.columns.some((c: { label: string }) => c.label === "Style ID") && myReport.columns.some((c: { label: string }) => c.label === "Article ID") && myReport.total === 3);
  const meImport = await runImport(admin, meesho.data.platform.id, "meesho.csv", csv([["SKU", "Name", "Catalog ID"], [`ME-${suffix}-1`, "Oakcraft Matrix Ergonomic Office Chair Black", `CAT${suffix}`]]));
  check("Import works for the platform created a moment ago", meImport.commit?.status === 200 && meImport.commit.data.counts.new === 1, meImport.commit?.data ?? meImport.preview?.data ?? meImport.up.data);
  check("Deactivating a platform removes it from coverage without losing its listings",
    (await admin.patch(`/api/platforms/${meesho.data.platform.id}`, { status: "INACTIVE" })).status === 200 &&
    (await admin.get(`/api/masters/${master1}`)).data.coverage.total === cov1.total &&
    (await admin.get(`/api/listings?platformId=${meesho.data.platform.id}`)).data.total === 1);

  section("22. Audit history");
  const audit = (await admin.get("/api/audit?pageSize=200")).data.rows as { action: string; old_value: Record<string, unknown> | null; new_value: Record<string, unknown> | null; entity_label: string }[];
  for (const a of ["MASTER_CREATED", "PLATFORM_CREATED", "PLATFORM_FIELD_ADDED", "LISTING_CREATED", "MAPPED", "REMAPPED", "REMAP_REQUESTED", "BULK_MAPPING", "EXCEL_MAPPING", "IMPORT_COMPLETED", "EXPORT"]) {
    check(`Audit log has ${a}`, audit.some((x) => x.action === a));
  }
  check("Re-mapping audit entry records old and new Master SKU", audit.some((x) => x.action === "REMAPPED" && x.old_value?.master_sku === M1 && x.new_value?.master_sku === M2));

  section("23. Export");
  const x1 = await admin.download("/api/reports/all-listings?format=xlsx");
  const x1rows = sheetRows(x1.buf);
  check("All listings export (normalised, one row per listing)", x1.status === 200 && x1rows.length === (await admin.get("/api/listings?pageSize=1")).data.total && ["Master SKU", "Product", "Platform", "Child SKU", "Listing Name", "Product ID", "Status", "URL"].every((k) => k in x1rows[0]), Object.keys(x1rows[0] ?? {}));
  const x2 = sheetRows((await admin.download("/api/reports/consolidated?format=xlsx")).buf);
  check("Consolidated export has one SKU column per platform, generated dynamically", x2.length >= 3 && "Amazon SKU" in x2[0] && "Flipkart SKU" in x2[0] && `Myntra ${suffix} SKU` in x2[0], Object.keys(x2[0] ?? {}));
  const x3 = await admin.download("/api/reports/unmapped?format=csv");
  check("CSV export works", x3.status === 200 && x3.buf.toString("utf8").includes("Child SKU"));

  section("24–25. Soft delete and restore");
  const delId = bulkIds[2];
  check("Listing soft-deleted", (await admin.del(`/api/listings/${delId}`)).status === 200);
  check("Deleted listing leaves the normal lists", !((await admin.get(`/api/listings?q=BULK-${suffix}-3`)).data.rows as { id: number }[]).some((l) => l.id === delId));
  check("Deleted listing is still in the database (deleted view)", ((await admin.get(`/api/listings?deleted=only&q=BULK-${suffix}-3`)).data.rows as { id: number }[]).some((l) => l.id === delId));
  check("Re-creating a deleted Child SKU is refused in favour of restore", (await admin.post("/api/listings", { platform_id: amazon.id, child_sku: `BULK-${suffix}-3` })).status === 409);
  check("Listing restored with its mapping intact", (await admin.post(`/api/listings/${delId}/restore`)).status === 200 && (await admin.get(`/api/listings/${delId}`)).data.listing.master_sku === M3);
  const dm = await admin.del(`/api/masters/${master3}`);
  check("Master SKU soft-deleted; its listings are flagged, not lost", dm.status === 200 && dm.data.flagged >= 1 && (await admin.get(`/api/listings/${delId}`)).data.listing.mapping_status === "REMAPPING_REQUIRED", dm.data);
  check("Master SKU restored; its listings are mapped again", (await admin.post(`/api/masters/${master3}/restore`)).status === 200 && (await admin.get(`/api/listings/${delId}`)).data.listing.mapping_status === "MAPPED");
  check("Unmap returns a listing to Unmapped SKUs", (await admin.post(`/api/listings/${bulkIds[1]}/unmap`)).status === 200 && (await admin.get(`/api/listings/${bulkIds[1]}`)).data.listing.mapping_status === "UNMAPPED");
  const fromL = await admin.post("/api/masters/from-listings", { master: { master_sku: `OC-RACK-${suffix}`, product_name: "Storage Rack 2 Tier", model: "Rack" }, listingIds: [bulkIds[1]] });
  check("Create a Master SKU directly from an unmapped listing", fromL.status === 200 && fromL.data.mapped === 1 && (await admin.get(`/api/listings/${bulkIds[1]}`)).data.listing.master_sku === `OC-RACK-${suffix}`, fromL.data);

  section("User roles");
  const staffEmail = `staff.${suffix.toLowerCase()}@oakcraft.in`, viewerEmail = `viewer.${suffix.toLowerCase()}@oakcraft.in`;
  check("Admin creates Staff and Viewer users", (await admin.post("/api/users", { name: "Test Staff", email: staffEmail, password: "Staff@12345", role: "STAFF" })).status === 200 && (await admin.post("/api/users", { name: "Test Viewer", email: viewerEmail, password: "Viewer@12345", role: "VIEWER" })).status === 200);
  check("Weak password rejected", (await admin.post("/api/users", { name: "X", email: `x.${suffix}@oakcraft.in`, password: "short", role: "STAFF" })).status === 400);
  const staff = new Client(), viewer = new Client();
  await staff.login(staffEmail, "Staff@12345");
  await viewer.login(viewerEmail, "Viewer@12345");
  check("Staff can map SKUs", (await staff.post(`/api/listings/${bulkIds[0]}/map`, { masterId: master2 })).status === 200);
  check("Staff cannot add platforms (403)", (await staff.post("/api/platforms", { platform_name: "Nope", platform_code: "NOPE" })).status === 403);
  check("Staff cannot create Master SKUs by default (403)", (await staff.post("/api/masters", { master_sku: "OC-NOPE-1", product_name: "x" })).status === 403);
  check("Staff cannot read audit logs (403)", (await staff.get("/api/audit")).status === 403);
  check("Viewer can search and view", (await viewer.get(`/api/search?q=${M1}`)).status === 200);
  check("Viewer cannot map (403)", (await viewer.post(`/api/listings/${bulkIds[0]}/map`, { masterId: master1 })).status === 403);
  check("Viewer cannot export unless permitted (403)", (await viewer.raw("GET", "/api/reports/all-listings?format=xlsx")).status === 403);
  check("Deactivated user is signed out", (await admin.patch(`/api/users/${(await admin.get("/api/users")).data.users.find((u: { email: string }) => u.email === viewerEmail).id}`, { status: "INACTIVE" })).status === 200 && (await viewer.get("/api/masters")).status === 401);

  section("Decisions made by people are never undone by the system");
  const st = await admin.post("/api/listings", { platform_id: flipkart.id, child_sku: A_SKU, listing_name: "Same SKU as the Amazon listing" });
  check("A listing whose SKU is mapped on another platform is auto-mapped (97%)", st.data.listing?.mapping_status === "MAPPED" && st.data.listing.master_sku === M1 && st.data.listing.mapping_confidence === 97, st.data);
  await admin.post(`/api/listings/${st.data.listing.id}/unmap`);
  const rr1 = await admin.post("/api/mapping/rematch", {});
  const afterRematch = (await admin.get(`/api/listings/${st.data.listing.id}`)).data.listing;
  check("After a person removes that mapping, re-running auto-match does not bring it back", rr1.status === 200 && afterRematch.mapping_status === "UNMAPPED" && afterRematch.master_sku === null, afterRematch);
  const sg = (await admin.get(`/api/listings/${st.data.listing.id}/suggestions`)).data.suggestions as { masterSku: string }[];
  check("The rejected Master SKU is no longer suggested", !sg.some((x) => x.masterSku === M1), sg);
  check("A person can still map it there deliberately", (await admin.post(`/api/listings/${st.data.listing.id}/map`, { masterId: master1 })).data.changed === true);

  section("Hardening");
  check("Text fields accept numbers and refuse objects (400, not a server error)",
    (await admin.post("/api/listings", { platform_id: amazon.id, child_sku: 987650000 + Number.parseInt(suffix, 36) % 1000, listing_name: 42 })).status === 200 &&
    (await admin.post("/api/listings", { platform_id: amazon.id, child_sku: { a: 1 } })).status === 400);
  check("An unknown sort key falls back to the default instead of failing", (await admin.get("/api/listings?sort=constructor")).status === 200 && (await admin.get("/api/masters?sort=__proto__")).status === 200);
  check("Settings cannot be saved with a broken shape", (await admin.call("PUT", "/api/settings", { permissions: null })).status === 400 && (await admin.call("PUT", "/api/settings", { matching: { autoMapThreshold: 20, reviewThreshold: 10 } })).status === 400);
  const big = await fetch(BASE + "/api/imports", { method: "POST", headers: { Cookie: admin.cookie, Origin: BASE, "Content-Type": "multipart/form-data; boundary=x", "Content-Length": String(900 * 1024 * 1024) }, body: "--x--", duplex: "half" } as RequestInit).catch(() => null);
  check("Oversized uploads are refused before they are read", big === null || big.status === 413 || big.status === 400, big?.status);
  const shifted = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(shifted, XLSX.utils.aoa_to_sheet([[], [], ["Seller SKU", "Product Title", "Style ID"], [`MY-SHIFT-${suffix}`, "Zzyzx Unrelated Item", `SH${suffix}`]]), "Sheet1");
  const sh = await admin.upload("/api/imports", { platformId: String(myntra) }, "shifted.xlsx", XLSX.write(shifted, { type: "buffer", bookType: "xlsx" }) as Buffer);
  check("A sheet with empty rows on top keeps Excel's row numbers (header row 3, data row 4)", sh.status === 200 && sh.data.config.headerRow === 3 && sh.data.config.dataStartRow === 4 && sh.data.dataRows === 1, sh.data?.config);
  await admin.post(`/api/imports/${sh.data.import.id}/cancel`);

  const second = new Client();
  await second.login(staffEmail, "Staff@12345");
  const me1 = (await staff.get("/api/auth/me")).data;
  check("A user created by an admin is asked to set their own password", me1.user.mustChangePassword === true, me1.user);
  check("Changing your password signs out your other sessions", (await staff.post("/api/auth/password", { current: "Staff@12345", next: "Staff@67890" })).status === 200 && (await second.get("/api/masters")).status === 401 && (await staff.get("/api/auth/me")).data.user.mustChangePassword === false);
  check("Staff do not receive the activity feed or the mapping audit report", (await staff.get("/api/dashboard")).data.activity === null && (await staff.get("/api/reports/mapping-audit")).status === 403 && !((await staff.get("/api/reports")).data.reports as { key: string }[]).some((r) => r.key === "mapping-audit"));
  await admin.call("PUT", "/api/settings", { permissions: { staffCanImport: true, staffCanExport: false, staffCanCreateMasters: false, viewerCanExport: false } });
  const sheetNoExport = await staff.download("/api/mapping/excel");
  const noExportRows = sheetRows(sheetNoExport.buf) as { "Mapping Status": string }[];
  check("Without export permission the mapping sheet only carries listings that still need mapping", sheetNoExport.status === 200 && noExportRows.every((r) => r["Mapping Status"] !== "MAPPED"), noExportRows.filter((r) => r["Mapping Status"] === "MAPPED").length);
  check("Without export permission report downloads are refused", (await staff.raw("GET", "/api/reports/all-listings?format=csv")).status === 403);
  await admin.call("PUT", "/api/settings", { permissions: { staffCanImport: true, staffCanExport: true, staffCanCreateMasters: false, viewerCanExport: false } });

  // -------------------------------------------------------------------------------------------
  const amazonFile = join(process.cwd(), "sample-data", "Amazon.xlsx");
  const flipkartFile = join(process.cwd(), "sample-data", "Flipkart.xls");
  if (existsSync(amazonFile) && existsSync(flipkartFile)) {
    section("Real marketplace files (sample-data/Amazon.xlsx, sample-data/Flipkart.xls)");
    const amzBefore = (await admin.get(`/api/listings?platformId=${amazon.id}&pageSize=1`)).data.total;
    const a = await runImport(admin, amazon.id, "Amazon.xlsx", readFileSync(amazonFile));
    check("Amazon template applied automatically (seller-sku → Child SKU, asin1 → ASIN)", a.up.data.template?.applied === true && a.up.data.config.columnMap["seller-sku"] === "child_sku" && a.up.data.config.columnMap["asin1"] === "cf:asin", a.up.data.config);
    check("Amazon file: 372 records, none lost", a.commit?.status === 200 && a.commit.data.counts.total === 372 && a.commit.data.counts.new + a.commit.data.counts.updated === 372 && a.commit.data.counts.errors === 0, a.commit?.data ?? a.preview?.data);
    check("Amazon listings in database grew by exactly the new rows", (await admin.get(`/api/listings?platformId=${amazon.id}&pageSize=1`)).data.total === amzBefore + a.commit!.data.counts.new);
    const f = await runImport(admin, flipkart.id, "Flipkart.xls", readFileSync(flipkartFile));
    check("Flipkart template applied (header row 1, data from row 3: description row skipped)", f.up.data.template?.applied === true && f.up.data.config.dataStartRow === 3 && f.up.data.dataRows === 297, { cfg: f.up.data.config, rows: f.up.data.dataRows });
    check("Flipkart file: 297 records, none lost", f.commit?.status === 200 && f.commit.data.counts.total === 297 && f.commit.data.counts.new + f.commit.data.counts.updated === 297 && f.commit.data.counts.errors === 0 && f.commit.data.counts.duplicates === 0, f.commit?.data ?? f.preview?.data);
    const both = (await admin.get(`/api/listings?platformId=${flipkart.id}&q=2-15-black`)).data.rows as { child_sku: string }[];
    check('Both "2-15-Black" and "2-15-BLACK" are kept as separate Flipkart listings', both.some((l) => l.child_sku === "2-15-Black") && both.some((l) => l.child_sku === "2-15-BLACK"), both.map((b) => b.child_sku));
    const real = (await admin.get(`/api/search?q=B0G2J9ZW9C`)).data;
    check("A real ASIN is searchable", real.listings.some((l: { child_sku: string }) => l.child_sku === "2XMATRIXBLACK"));

    // Map one Amazon SKU that also exists on Flipkart, then re-run matching: the Flipkart twin follows.
    const twinA = ((await admin.get(`/api/listings?platformId=${amazon.id}&q=Pears_White_Grey`)).data.rows as { id: number; child_sku: string }[]).find((l) => l.child_sku === "Pears_White_Grey");
    if (twinA) {
      const pm = await admin.post("/api/masters/from-listings", { master: { master_sku: `OC-PEARS-${suffix}`, product_name: "Pears Mesh Office Chair", model: "Pears", color: "White Grey" }, listingIds: [twinA.id] });
      const rel = (await admin.get(`/api/listings/${twinA.id}/related`)).data.related as { platform_name: string; child_sku: string }[];
      check("After mapping, the same SKU on another platform is offered as related", pm.status === 200 && rel.some((r) => r.platform_name === "Flipkart" && r.child_sku === "Pears_White_Grey"), rel);
      const rr = await admin.post("/api/mapping/rematch", {});
      const twinF = ((await admin.get(`/api/listings?platformId=${flipkart.id}&q=Pears_White_Grey`)).data.rows as { child_sku: string; master_sku: string | null; mapping_confidence: number }[]).find((l) => l.child_sku === "Pears_White_Grey");
      check("Re-running auto-match maps the Flipkart twin at 97%", rr.status === 200 && twinF?.master_sku === `OC-PEARS-${suffix}` && twinF.mapping_confidence === 97, { rr: rr.data, twinF });
    }
    const nav = (await admin.get("/api/auth/me")).data.counts;
    const d2 = (await admin.get("/api/dashboard")).data.cards;
    check("Dashboard counters add up (mapped + unmapped + review + re-mapping = total listings)", d2.mappedListings + d2.unmapped + d2.needsReview + d2.remapping === d2.listings && nav.unmapped === d2.unmapped + d2.remapping, d2);
  } else {
    console.log("\n(sample-data/Amazon.xlsx and Flipkart.xls not found: real-file checks skipped)");
  }

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) { console.log("Failed:\n  - " + failures.join("\n  - ")); process.exit(1); }
}

main().catch((e) => { console.error(e); process.exit(1); });
