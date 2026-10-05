import { api, intQ } from "@/server/http";
import { searchMasters } from "@/server/masters";

export const GET = api("view", async ({ url }) => ({
  masters: await searchMasters(url.searchParams.get("q") ?? "", Math.min(Math.max(intQ(url, "limit") ?? 12, 1), 50)),
}));
