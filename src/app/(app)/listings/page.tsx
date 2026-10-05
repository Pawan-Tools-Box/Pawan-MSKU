"use client";
import { ListingBrowser } from "@/components/ListingBrowser";

export default function ListingsPage() {
  return (
    <ListingBrowser
      mode="all" title="All Listings" exportReport="all-listings"
      description="Every Child SKU on every platform, mapped or not."
      emptyTitle="No listings yet"
      emptyBody="Import a marketplace file, or add a listing by hand."
    />
  );
}
