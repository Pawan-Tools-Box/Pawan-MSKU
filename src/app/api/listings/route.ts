import { api, boolQ, intQ, strQ } from "@/server/http";
import { createListing, listListings, type ListingFilter, type ListingInput } from "@/server/listings";

export const GET = api("view", async ({ url }) =>
  listListings({
    q: strQ(url, "q"), platformId: intQ(url, "platformId"), masterId: intQ(url, "masterId"), importId: intQ(url, "importId"),
    mappingStatus: strQ(url, "mappingStatus")?.split(",").filter(Boolean), listingStatus: strQ(url, "listingStatus"),
    inactive: boolQ(url, "inactive"), age: strQ(url, "age") as ListingFilter["age"],
    deleted: (strQ(url, "deleted") as ListingFilter["deleted"]) ?? "exclude", hasSuggestion: boolQ(url, "hasSuggestion"),
    sort: strQ(url, "sort"), dir: strQ(url, "dir") === "asc" ? "asc" : "desc", page: intQ(url, "page"), pageSize: intQ(url, "pageSize"),
  })
);

export const POST = api("listing.write", async ({ body, user }) => ({ listing: await createListing(await body<ListingInput>(), user) }));
