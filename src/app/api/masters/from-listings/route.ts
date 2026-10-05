import { api } from "@/server/http";
import { createMasterFromListings, type MasterInput } from "@/server/masters";

export const POST = api("master.write", async ({ body, user, require }) => {
  require("mapping.write");
  const { master, listingIds } = await body<{ master: MasterInput; listingIds: number[] }>();
  return createMasterFromListings(master ?? {}, (listingIds ?? []).map(Number).filter(Boolean), user);
});
