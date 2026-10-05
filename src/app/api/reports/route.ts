import { api } from "@/server/http";
import { reportCatalog } from "@/server/reports";

export const GET = api("view", async ({ can }) => ({ reports: await reportCatalog(can("audit.view")) }));
