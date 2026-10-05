import { api } from "@/server/http";
import { bulkMap, type BulkMapItem } from "@/server/listings";

export const POST = api("mapping.write", async ({ body, user }) => {
  const { items, skipInvalid } = await body<{ items: BulkMapItem[]; skipInvalid?: boolean }>();
  return bulkMap(
    (items ?? []).map((i) => ({ listingId: Number(i.listingId), masterId: i.masterId ? Number(i.masterId) : null, masterSku: i.masterSku ?? null })),
    user, { skipInvalid: !!skipInvalid }
  );
});
