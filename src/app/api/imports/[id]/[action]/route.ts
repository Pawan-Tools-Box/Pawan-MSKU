import { logAudit } from "@/server/audit";
import { notFound } from "@/server/errors";
import { XLSX_MIME } from "@/server/excel";
import { api, fileResponse, idParam, intQ, strQ } from "@/server/http";
import { cancelImport, commitImport, describeImport, importReportXlsx, listImportRows, previewImport, type ImportConfig } from "@/server/imports";

type P = { id: string; action: string };

export const GET = api<P>("view", async ({ params, url, user, require }) => {
  const id = idParam(params.id);
  switch (params.action) {
    case "describe": {
      require("import.run");
      const sheetName = strQ(url, "sheet"), headerRow = intQ(url, "headerRow"), dataStartRow = intQ(url, "dataStartRow");
      return describeImport(id, sheetName || headerRow || dataStartRow ? { sheetName, headerRow, dataStartRow } : undefined);
    }
    case "rows":
      return listImportRows(id, { outcome: strQ(url, "outcome"), mappingStatus: strQ(url, "mappingStatus"), page: intQ(url, "page"), pageSize: intQ(url, "pageSize") });
    case "report": {
      require("export.run");
      const { buffer, fileName } = await importReportXlsx(id);
      await logAudit({ user, action: "EXPORT", entityType: "import", entityId: id, entityLabel: fileName });
      return fileResponse(buffer, fileName, XLSX_MIME);
    }
    default: throw notFound("Not found.");
  }
});

export const POST = api<P>("import.run", async ({ params, body, user }) => {
  const id = idParam(params.id);
  switch (params.action) {
    case "preview": return previewImport(id, (await body<{ config: Partial<ImportConfig> }>()).config);
    case "commit": {
      const { saveTemplate } = await body<{ saveTemplate?: boolean }>();
      return commitImport(id, user, { saveTemplate: saveTemplate !== false });
    }
    case "cancel": await cancelImport(id); return { ok: true };
    default: throw notFound("Not found.");
  }
});
