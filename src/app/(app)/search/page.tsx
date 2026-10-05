"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useApi } from "@/components/api";
import { ListingsTable } from "@/components/ListingsTable";
import { usePlatforms } from "@/components/platforms";
import { Empty, ErrorNote, LinkButton, MasterTag, PageHeader, Panel, Spinner, StatusBadge } from "@/components/ui";
import type { globalSearch } from "@/server/search";

type Data = Awaited<ReturnType<typeof globalSearch>>;

export default function SearchPage() {
  const q = useSearchParams().get("q") ?? "";
  const { platforms } = usePlatforms();
  const { data, loading, error, reload } = useApi<Data>(q.trim().length >= 2 ? `/api/search?limit=50&q=${encodeURIComponent(q)}` : null);
  return (
    <>
      <PageHeader title={<>Results for <span className="font-mono text-[19px]">{q}</span></>} description="Searches Master SKUs, Child SKUs, listing names, Product IDs, Listing IDs and every searchable platform field." />
      {q.trim().length < 2 ? <Panel><Empty title="Type at least 2 characters in the search box above" /></Panel> : error ? <ErrorNote>{error}</ErrorNote> : loading && !data ? <Spinner /> : data && (
        data.masters.length === 0 && data.listings.length === 0 ? <Panel><Empty title="Nothing found">Check the spelling, or try part of the SKU. Deleted listings are found under All Listings → Deleted.</Empty></Panel> : (
          <div className="space-y-5">
            {data.masters.length > 0 && (
              <Panel title={`Master SKUs (${data.masters.length})`} pad={false}>
                <ul className="divide-y divide-line-2">
                  {data.masters.map((m) => (
                    <li key={m.id}>
                      <Link href={`/masters/${m.id}`} className="flex flex-wrap items-center gap-3 px-4 py-2.5 hover:bg-canopy-50">
                        <MasterTag sku={m.master_sku} />
                        <span className="min-w-0 flex-1"><span className="font-medium">{m.product_name}</span><span className="ml-2 text-[12.5px] text-ink-3">{[m.model, m.color, m.category].filter(Boolean).join(" · ")}</span></span>
                        {m.status !== "ACTIVE" && <StatusBadge status={m.status} />}
                        <span className="tnum text-[12.5px] text-ink-3">{m.listing_count} listings on {m.platform_count} platforms</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </Panel>
            )}
            {data.listings.length > 0 && (
              <Panel title={`Listings (${data.listingTotal})`} pad={false} actions={data.listingTotal > data.listings.length ? <LinkButton size="sm" href={`/listings?q=${encodeURIComponent(q)}`}>See all {data.listingTotal}</LinkButton> : undefined}>
                <ListingsTable rows={data.listings} platforms={platforms} onChanged={reload} />
              </Panel>
            )}
          </div>
        )
      )}
    </>
  );
}
