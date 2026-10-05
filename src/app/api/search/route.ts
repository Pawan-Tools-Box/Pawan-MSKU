import { api, intQ } from "@/server/http";
import { globalSearch } from "@/server/search";

export const GET = api("view", async ({ url }) => globalSearch(url.searchParams.get("q") ?? "", Math.min(Math.max(intQ(url, "limit") ?? 25, 1), 100)));
