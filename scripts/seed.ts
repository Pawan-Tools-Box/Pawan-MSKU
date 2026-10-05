/**
 * Base data for a fresh install: the first admin user, default settings, and the two starting
 * platforms (Amazon, Flipkart) with their fields and import templates. Safe to run again:
 * existing users, platforms and settings are left as they are.
 *
 * Amazon and Flipkart are ordinary rows created through the same service an admin uses in the UI.
 */
import "dotenv/config";
import { closePool, q, q1 } from "../src/server/db";
import { createUser } from "../src/server/auth";
import { createPlatform, saveTemplate, type FieldInput } from "../src/server/platforms";
import { DEFAULT_SETTINGS } from "../src/server/settings";

const PLATFORMS: {
  platform: Parameters<typeof createPlatform>[0];
  fields: FieldInput[];
  template: { header_row: number; data_start_row: number; column_map: Record<string, string> };
}[] = [
  {
    platform: {
      platform_name: "Amazon", platform_code: "AMAZON", platform_type: "Marketplace", website_url: "https://www.amazon.in",
      brand_color: "#E47911", listing_url_template: "https://www.amazon.in/dp/{product_id}",
      description: "Amazon.in Seller Central. Import the All Listings Report.",
    },
    fields: [
      { field_label: "ASIN", is_primary_identifier: true, use_for_matching: true, sortable: true },
      { field_label: "FNSKU", use_for_matching: true },
      { field_label: "Parent SKU" },
      { field_label: "Fulfilment Channel", searchable: false },
      { field_label: "Selling Price", field_type: "number", searchable: false, sortable: true },
      { field_label: "MRP", field_type: "number", searchable: false },
    ],
    template: {
      header_row: 1, data_start_row: 2,
      column_map: {
        "seller-sku": "child_sku", "item-name": "listing_name", "listing-id": "listing_id", "asin1": "cf:asin", "status": "listing_status",
        "fulfillment-channel": "cf:fulfilment_channel", "price": "cf:selling_price", "maximum-retail-price": "cf:mrp",
      },
    },
  },
  {
    platform: {
      platform_name: "Flipkart", platform_code: "FLIPKART", platform_type: "Marketplace", website_url: "https://www.flipkart.com",
      brand_color: "#2874F0", listing_url_template: "https://www.flipkart.com/product/p/itme?pid={product_id}",
      description: "Flipkart Seller Hub. Import the Listings export (the sheet has a description row under the header).",
    },
    fields: [
      { field_label: "FSN", is_primary_identifier: true, use_for_matching: true, sortable: true },
      { field_label: "Sub-category", searchable: false },
      { field_label: "Fulfilment By", searchable: false },
      { field_label: "Selling Price", field_type: "number", searchable: false, sortable: true },
      { field_label: "MRP", field_type: "number", searchable: false },
    ],
    template: {
      header_row: 1, data_start_row: 3,
      column_map: {
        "Seller SKU Id": "child_sku", "Product Title": "listing_name", "Flipkart Serial Number": "cf:fsn", "Listing ID": "listing_id",
        "Listing Status": "listing_status", "Sub-category": "cf:sub_category", "Fulfillment By": "cf:fulfilment_by",
        "Your Selling Price": "cf:selling_price", "MRP": "cf:mrp",
      },
    },
  },
];

async function main() {
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await q("INSERT INTO settings (key, value) VALUES ($1, $2::jsonb) ON CONFLICT (key) DO NOTHING", [key, JSON.stringify(value)]);
  }

  const users = await q1<{ n: number }>("SELECT count(*) AS n FROM users");
  if (!users?.n) {
    const email = (process.env.ADMIN_EMAIL || "admin@oakcraft.in").trim();
    // On a public server the first password must be chosen by you, never a well-known default.
    if (!process.env.ADMIN_PASSWORD && process.env.NODE_ENV === "production") {
      throw new Error("ADMIN_PASSWORD is not set. Add it to the environment (at least 8 characters, with letters and numbers) and start again.");
    }
    const password = process.env.ADMIN_PASSWORD || "ChangeMe@123";
    try {
      await createUser({ name: process.env.ADMIN_NAME || "Admin", email, password, role: "ADMIN" }, null);
    } catch (e) {
      throw new Error(`Could not create the first admin from ADMIN_EMAIL / ADMIN_PASSWORD: ${(e as Error).message}`);
    }
    console.log(`Admin user created: ${email}  (change the password after first sign-in)`);
  } else {
    console.log("Users already exist, admin not created.");
  }

  for (const def of PLATFORMS) {
    const exists = await q1("SELECT 1 FROM platforms WHERE upper(platform_code) = $1", [def.platform.platform_code]);
    if (exists) { console.log(`Platform ${def.platform.platform_name} already exists, skipped.`); continue; }
    const p = await createPlatform({ ...def.platform, fields: def.fields }, null);
    await saveTemplate(p.id, { template_name: "Default", sheet_name: null, ...def.template }, null);
    console.log(`Platform ${p.platform_name} created with ${def.fields.length} fields and an import template.`);
  }
  await closePool();
}

main().catch((e) => { console.error(`\nSetup stopped: ${(e as Error).message}\n`); process.exit(1); });
