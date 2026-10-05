import { logAudit } from "@/server/audit";
import { buildCsv, buildXlsx, CSV_MIME, XLSX_MIME } from "@/server/excel";
import { api, fileResponse, intQ, strQ } from "@/server/http";
import { AUDIT_REPORTS, rowsForExport, runReport } from "@/server/reports";

export const GET = api<{ key: string }>("view", async ({ params, url, user, require }) => {
  const format = strQ(url, "format");
  const platformId = intQ(url, "platformId");
  if (AUDIT_REPORTS.has(params.key)) require("audit.view");
  if (format === "xlsx" || format === "csv") {
    require("export.run");
    const result = await runReport(params.key, { platformId, all: true });
    const rows = rowsForExport(result);
    const stamp = new Date().toISOString().slice(0, 10);
    const name = `${result.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${stamp}`;
    await logAudit({ user, action: "EXPORT", entityType: "report", entityLabel: result.title, platformId: platformId ?? result.platformId ?? null, newValue: { format, rows: rows.length } });
    return format === "csv"
      ? fileResponse(buildCsv(result.columns, rows), `${name}.csv`, CSV_MIME)
      : fileResponse(buildXlsx([{ name: result.title, columns: result.columns, rows }]), `${name}.xlsx`, XLSX_MIME);
  }
  return runReport(params.key, { platformId, page: intQ(url, "page"), pageSize: intQ(url, "pageSize") });
});
