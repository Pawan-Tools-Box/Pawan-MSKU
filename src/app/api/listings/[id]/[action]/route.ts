import { badRequest, notFound } from "@/server/errors";
import { api, idParam } from "@/server/http";
import {
  acceptSuggestion, mapListing, mappingHistory, rejectSuggestion, relatedUnmapped, requestRemap, restoreListing,
  suggestionsFor, unmapListing,
} from "@/server/listings";

type P = { id: string; action: string };

export const GET = api<P>("view", async ({ params }) => {
  const id = idParam(params.id);
  switch (params.action) {
    case "suggestions": return { suggestions: await suggestionsFor(id) };
    case "related": return { related: await relatedUnmapped(id) };
    case "history": return { history: await mappingHistory(id) };
    default: throw notFound("Not found.");
  }
});

export const POST = api<P>("view", async ({ params, body, user, require }) => {
  const id = idParam(params.id);
  const data = await body<{ masterId?: number; note?: string }>();
  switch (params.action) {
    case "map": {
      require("mapping.write");
      if (!data.masterId) throw badRequest("Select a Master SKU.");
      return mapListing(id, Number(data.masterId), user, { note: data.note ?? null });
    }
    case "unmap": require("mapping.write"); return unmapListing(id, user, data.note ?? null);
    case "request-remap": require("mapping.write"); return requestRemap(id, user, data.note ?? null);
    case "accept": require("mapping.write"); return acceptSuggestion(id, user);
    case "reject": require("mapping.write"); return rejectSuggestion(id, user);
    case "restore": require("listing.delete"); await restoreListing(id, user); return { ok: true };
    default: throw notFound("Not found.");
  }
});
