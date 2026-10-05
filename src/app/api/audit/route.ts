import { listAudit } from "@/server/audit";
import { api, intQ, strQ } from "@/server/http";

export const GET = api("audit.view", async ({ url }) =>
  listAudit({
    q: strQ(url, "q"), action: strQ(url, "action"), entityType: strQ(url, "entityType"), entityId: intQ(url, "entityId"),
    userId: intQ(url, "userId"), platformId: intQ(url, "platformId"), from: strQ(url, "from"), to: strQ(url, "to"),
    page: intQ(url, "page"), pageSize: intQ(url, "pageSize"),
  })
);
