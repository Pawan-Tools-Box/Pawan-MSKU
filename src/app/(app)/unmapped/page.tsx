"use client";
import { ListingBrowser } from "@/components/ListingBrowser";

export default function UnmappedPage() {
  return (
    <ListingBrowser
      mode="unmapped" title="Unmapped SKUs" exportReport="unmapped"
      description="Marketplace Child SKUs that are not connected to a Master SKU. Nothing here is ever dropped: map each one, or create a Master SKU from it."
      emptyTitle="Every Child SKU is mapped"
      emptyBody="New unmatched SKUs appear here after each import."
    />
  );
}
