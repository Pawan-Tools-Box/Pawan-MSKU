"use client";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Download } from "lucide-react";
import { useState } from "react";
import { fmtDateTime, fmtNum, qs, useApi } from "@/components/api";
import { useSession } from "@/components/session";
import { cn, Empty, ErrorNote, LinkButton, MappingBadge, MasterTag, PageHeader, Pagination, Panel, PlatformName, Select, Spinner, StatusBadge } from "@/components/ui";
import type { ImportLogRow, ImportRowView } from "@/server/imports";
import type { Paged } from "@/server/types";

export default function ImportDetailPage() {
  const { id } = useParams<{ id: string }>();
  const sp = useSearchParams();
  const { can } = useSession();
  const [filter, setFilter] = useState(sp.get("mappingStatus") ? `m:${sp.get("mappingStatus")}` : "");
  const [page, setPage] = useState(1);
  const imp = useApi<{ import: ImportLogRow }>(`/api/imports/${id}`);
  const rows = useApi<Paged<ImportRowView>>(`/api/imports/${id}/rows${qs({ page, pageSize: 100, mappingStatus: filter.startsWith("m:") ? filter.slice(2) : "", outcome: filter.startsWith("o:") ? filter.slice(2) : "" })}`);
  if (imp.loading && !imp.data) return <Spinner />;
  if (imp.error || !imp.data) return <ErrorNote>{imp.error ?? "Import not found."}</ErrorNote>;
  const i = imp.data.import;
  const cells: [string, number, string][] = [
    ["Total", i.total_records, ""], ["New", i.new_records, "o:CREATED"], ["Updated", i.updated_records, "o:UPDATED"], ["Mapped", i.mapped_records, "m:MAPPED"],
    ["Unmapped", i.unmapped_records, "m:UNMAPPED"], ["Needs review", i.review_records, "m:NEEDS_REVIEW"], ["Duplicates", i.duplicate_records, "o:DUPLICATE"], ["Errors", i.error_records, "o:ERROR"],
  ];
  return (
    <>
      <PageHeader
        back={{ href: "/import", label: "Import Data" }} title={i.file_name}
        description={<><PlatformName name={i.platform_name} color={i.platform_color} /> · imported {fmtDateTime(i.completed_at ?? i.created_at)} by {i.imported_by_name ?? "—"} · <StatusBadge status={i.status} /></>}
        actions={can("export.run") && i.status === "COMPLETED" && <LinkButton href={`/api/imports/${i.id}/report`} icon={<Download className="size-3.5" />}>Download report</LinkButton>}
      />
      {i.error_message && <ErrorNote className="mb-4">{i.error_message}</ErrorNote>}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-4 lg:grid-cols-8">
        {cells.map(([k, v, f]) => (
          <button key={k} type="button" onClick={() => { setFilter(f); setPage(1); }} className={cn("bg-card px-4 py-3 text-left hover:bg-canopy-50", filter === f && "bg-canopy-50 shadow-[inset_0_-2px_0_var(--color-canopy-700)]")}>
            <p className="text-[12.5px] text-ink-3">{k}</p><p className="tnum mt-0.5 text-[20px] font-semibold">{fmtNum(v)}</p>
          </button>
        ))}
      </div>
      <Panel className="mt-5" pad={false} title="Rows in this import" actions={
        <Select value={filter} onChange={(e) => { setFilter(e.target.value); setPage(1); }} className="h-8 w-auto text-[12.5px]" aria-label="Filter rows">
          <option value="">All rows</option><option value="m:MAPPED">Mapped</option><option value="m:UNMAPPED">Unmapped</option><option value="m:NEEDS_REVIEW">Needs review</option>
          <option value="o:CREATED">New listings</option><option value="o:UPDATED">Updated listings</option><option value="o:DUPLICATE">Duplicates</option><option value="o:ERROR">Errors</option>
        </Select>
      }>
        {rows.loading && !rows.data ? <Spinner /> : !rows.data?.rows.length ? <Empty title="No rows in this group" /> : (
          <>
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead><tr><th className="w-16">File row</th><th>Child SKU</th><th>Listing name</th><th>Result</th><th>At import</th><th>Now</th><th>Notes</th></tr></thead>
                <tbody>
                  {rows.data.rows.map((r) => (
                    <tr key={r.id}>
                      <td className="tnum text-ink-3">{r.row_number}</td>
                      <td className="max-w-[220px] truncate font-mono text-[12.5px]">{r.child_sku ? <Link href={`/listings?q=${encodeURIComponent(r.child_sku)}`} className="hover:underline">{r.child_sku}</Link> : <span className="font-sans text-unmapped">empty</span>}</td>
                      <td className="max-w-[300px]"><p className="line-clamp-1" title={r.listing_name ?? undefined}>{r.listing_name || "—"}</p></td>
                      <td><StatusBadge status={r.outcome} /></td>
                      <td className="whitespace-nowrap"><MappingBadge status={r.mapping_status} confidence={r.confidence} />{r.master_sku && <span className="ml-1.5"><MasterTag sku={r.master_sku} /></span>}</td>
                      <td className="whitespace-nowrap">{r.current_mapping_status ? <><MappingBadge status={r.current_mapping_status} />{r.current_master_sku && <span className="ml-1.5"><MasterTag sku={r.current_master_sku} /></span>}</> : <span className="text-ink-3">—</span>}</td>
                      <td className="max-w-[340px] text-[12.5px] text-ink-2">{r.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={rows.data.page} pageSize={rows.data.pageSize} total={rows.data.total} onPage={setPage} />
          </>
        )}
      </Panel>
    </>
  );
}
