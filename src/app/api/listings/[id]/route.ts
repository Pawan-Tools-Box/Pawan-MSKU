import { api, idParam } from "@/server/http";
import { getListing, softDeleteListing, updateListing, type ListingInput } from "@/server/listings";

export const GET = api<{ id: string }>("view", async ({ params }) => ({ listing: await getListing(idParam(params.id)) }));

export const PATCH = api<{ id: string }>("listing.write", async ({ params, body, user }) => ({
  listing: await updateListing(idParam(params.id), await body<ListingInput>(), user),
}));

export const DELETE = api<{ id: string }>("listing.delete", async ({ params, user }) => {
  await softDeleteListing(idParam(params.id), user);
  return { ok: true };
});
