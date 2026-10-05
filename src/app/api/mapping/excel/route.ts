import { logAudit } from "@/server/audit";
import { XLSX_MIME } from "@/server/excel";
import { api, fileResponse, intQ, strQ, uploadedFile } from "@/server/http";
import { importMappingExcel, mappingTemplateXlsx } from "@/server/mapping-excel";

const PENDING = ["UNMAPPED", "NEEDS_REVIEW", "REMAPPING_REQUIRED"];

export const GET = api("mapping.write", async ({ url, user, can }) => {
  // The mapping sheet is a working document. Without export permission it only carries listings that
  // still need mapping, so it cannot be used as a back door to export every listing.
  let statuses = strQ(url, "mappingStatus")?.split(",").filter(Boolean);
  if (!can("export.run")) statuses = statuses?.length ? statuses.filter((s) => PENDING.includes(s)) : PENDING;
  if (statuses && !statuses.length) statuses = PENDING;
  const buf = await mappingTemplateXlsx({ platformId: intQ(url, "platformId"), statuses });
  await logAudit({ user, action: "EXPORT", entityType: "report", entityLabel: "SKU mapping sheet" });
  return fileResponse(buf, "sku-mapping.xlsx", XLSX_MIME);
});

export const POST = api("mapping.write", async ({ req, user }) => {
  const { file, form, buffer } = await uploadedFile(req, 30, "Choose the filled-in mapping sheet.");
  return importMappingExcel(buffer, file.name, user, form.get("apply") === "1");
});
