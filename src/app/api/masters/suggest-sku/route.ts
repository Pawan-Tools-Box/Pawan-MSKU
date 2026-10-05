import { api } from "@/server/http";
import { suggestMasterSku } from "@/server/masters";

export const GET = api("view", async ({ url }) => ({ masterSku: await suggestMasterSku(url.searchParams.get("model") ?? "") }));
