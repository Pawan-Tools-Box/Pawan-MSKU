import { XLSX_MIME } from "@/server/excel";
import { api, fileResponse } from "@/server/http";
import { masterTemplateXlsx } from "@/server/masters";

export const GET = api("view", async () => fileResponse(masterTemplateXlsx(), "master-sku-template.xlsx", XLSX_MIME));
