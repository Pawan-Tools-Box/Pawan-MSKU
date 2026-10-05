"use client";
import { ListingBrowser } from "@/components/ListingBrowser";

export default function NeedsReviewPage() {
  return (
    <ListingBrowser
      mode="review" title="Needs Review" exportReport="needs-review"
      description="The system found a likely Master SKU but was not confident enough to map on its own. Accept the suggestion or choose another."
      emptyTitle="Nothing is waiting for review"
      emptyBody="Uncertain matches from imports will be listed here with a suggested Master SKU and a confidence score."
    />
  );
}
