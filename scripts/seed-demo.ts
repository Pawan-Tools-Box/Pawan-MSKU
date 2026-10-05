/**
 * Optional demo data matching the examples in the requirements: the Matrix chair on Amazon,
 * Flipkart and Myntra, one unmapped Amazon SKU, and two platforms with no listings yet so that
 * coverage reads "3 / 5, missing: Meesho, GeM". Do not run this on your production database.
 */
import "dotenv/config";
import { closePool, q1 } from "../src/server/db";
import { createListing } from "../src/server/listings";
import { createMaster } from "../src/server/masters";
import { createPlatform } from "../src/server/platforms";

async function platformId(code: string) {
  return (await q1<{ id: number }>("SELECT id FROM platforms WHERE upper(platform_code) = $1", [code]))?.id;
}

async function main() {
  if (await q1("SELECT 1 FROM master_products WHERE upper(master_sku) = 'OC-MATRIX-001'")) {
    console.log("Demo data already present.");
    return closePool();
  }
  const amazon = await platformId("AMAZON");
  const flipkart = await platformId("FLIPKART");
  if (!amazon || !flipkart) throw new Error("Run `npm run db:seed` first.");

  const myntra = (await platformId("MYNTRA")) ?? (await createPlatform({
    platform_name: "Myntra", platform_code: "MYNTRA", platform_type: "Marketplace", website_url: "https://www.myntra.com", brand_color: "#E91E63",
    fields: [{ field_label: "Style ID", is_primary_identifier: true, use_for_matching: true }, { field_label: "Article ID" }],
  }, null)).id;
  if (!(await platformId("MEESHO"))) await createPlatform({ platform_name: "Meesho", platform_code: "MEESHO", platform_type: "Marketplace", website_url: "https://www.meesho.com", brand_color: "#9F2089", fields: [{ field_label: "Catalog ID" }] }, null);
  if (!(await platformId("GEM"))) await createPlatform({ platform_name: "GeM", platform_code: "GEM", platform_type: "Government Marketplace", website_url: "https://gem.gov.in", brand_color: "#1B5E20", fields: [{ field_label: "Catalogue ID" }, { field_label: "Offer ID" }] }, null);

  const matrix = await createMaster({ master_sku: "OC-MATRIX-001", product_name: "Matrix Ergonomic Office Chair", model: "Matrix", category: "Office Chair", brand: "Oakcraft", product_type: "Chair", color: "Black", material: "Mesh", variant: "High Back" }, null);
  await createMaster({ master_sku: "OC-MATRIX-002", product_name: "Matrix Visitor Chair", model: "Matrix Visitor", category: "Visitor Chair", brand: "Oakcraft", product_type: "Chair", color: "Black", material: "Mesh" }, null);
  await createMaster({ master_sku: "OC-HURRICANE-001", product_name: "Hurricane Ergonomic Office Chair", model: "Hurricane", category: "Office Chair", brand: "Oakcraft", product_type: "Chair", color: "Black", material: "Mesh", variant: "High Back" }, null);

  await createListing({ platform_id: amazon, master_product_id: matrix.id, child_sku: "MATRIX-BLK-01", listing_name: "Oakcraft Matrix Ergonomic Office Chair", custom: { asin: "B0MATRIX001" }, color: "Black" }, null);
  await createListing({ platform_id: flipkart, master_product_id: matrix.id, child_sku: "FK-MATRIX-BLK", listing_name: "Oakcraft Matrix Office Chair Black", custom: { fsn: "FSNMATRIX001" }, color: "Black" }, null);
  await createListing({ platform_id: myntra, master_product_id: matrix.id, child_sku: "MY-MATRIX-BLK", listing_name: "Oakcraft Matrix Office Chair", custom: { style_id: "MY12345" }, color: "Black" }, null);
  await createListing({ platform_id: amazon, child_sku: "NEW-CHAIR-987", listing_name: "Oakcraft Premium Office Chair" }, null);

  console.log("Demo data created: 3 Master SKUs, Myntra / Meesho / GeM platforms, 4 listings (1 unmapped).");
  await closePool();
}

main().catch((e) => { console.error(e); process.exit(1); });
