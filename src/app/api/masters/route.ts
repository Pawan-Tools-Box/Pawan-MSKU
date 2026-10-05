import { api, intQ, strQ } from "@/server/http";
import { createMaster, listMasters, masterFacets, type MasterFilter, type MasterInput } from "@/server/masters";

export const GET = api("view", async ({ url }) => {
  const [list, facets] = await Promise.all([
    listMasters({
      q: strQ(url, "q"), status: strQ(url, "status"), category: strQ(url, "category"),
      coverage: strQ(url, "coverage") as MasterFilter["coverage"], missingPlatformId: intQ(url, "missingPlatformId"),
      platformId: intQ(url, "platformId"), deleted: strQ(url, "deleted") === "only" ? "only" : "exclude",
      sort: strQ(url, "sort"), dir: strQ(url, "dir") === "desc" ? "desc" : "asc", page: intQ(url, "page"), pageSize: intQ(url, "pageSize"),
    }),
    masterFacets(),
  ]);
  return { ...list, facets };
});

export const POST = api("master.write", async ({ body, user }) => ({ master: await createMaster(await body<MasterInput>(), user) }));
