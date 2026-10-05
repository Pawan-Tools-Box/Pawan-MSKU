"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Download } from "lucide-react";
import { useState } from "react";
import { fmtDateTime, fmtNum, qs, useApi } from "@/components/api";
import { usePlatforms } from "@/components/platforms";
import { useSession } from "@/components/session";
import { cn, Empty, ErrorNote, LinkButton, MappingBadge, MasterTag, PageHeader, Pagination, Panel, Select, Spinner, StatusBadge } from "@/components/ui";
import type { ReportColumn, ReportResult } from "@/server/reports";

const PLATFORM_FILTER = new Set(["all-listings", "inactive-listings", "unmapped", "needs-review", "mapping-audit", "import-history"]);

function Cell({ col, row }: { col: ReportColumn; row: Record<string, unknown> }) {
  const v = row[col.key];
  if (v === null || v === undefined || v === "") return <span className="text-ink-3">—</span>;
  switch (col.type) {
    case "master": return <MasterTag id={col.key === "master_sku" ? (row._master_id as number | undefined) : undefined} sku={String(v)} />;
    case "sku": return <span className="font-mono text-[12.5px]">{String(v)}</span>;
    case "mapping": return <MappingBadge status={String(v)} />;
    case "status": return <StatusBadge status={String(v)} />;
    case "date": return <span className="whitespace-nowrap text-ink-2">{fmtDateTime(String(v))}</span>;
    case "number": return <>{fmtNum(Number(v))}</>;
    case "percent": return <>{String(v)}%</>;
    case "link": return <a href={String(v)} target="_blank" rel="noopener noreferrer" className="font-medium text-canopy-700 hover:underline">Open</a>;
    default: return <span className={cn(String(v) === "✕" && "text-ink-3")}>{String(v)}</span>;
  }
}

export default function ReportPage() {
  const { key } = useParams<{ key: string }>();
  const { can } = useSession();
  const { platforms } = usePlatforms();
  const [platformId, setPlatformId] = useState("");
  const [page, setPage] = useState(1);
  const { data, loading, error } = useApi<ReportResult>(`/api/reports/${key}${qs({ platformId, page, pageSize: 50 })}`);
  const exportQs = (format: string) => `/api/reports/${key}${qs({ format, platformId })}`;
  return (
    <>
      <PageHeader
        back={{ href: "/reports", label: "Reports" }} title={data?.title ?? "Report"} description={data?.description}
        actions={can("export.run") && <>
          <LinkButton href={exportQs("csv")}>Download CSV</LinkButton>
          <LinkButton href={exportQs("xlsx")} variant="primary" icon={<Download className="size-3.5" />}>Download Excel</LinkButton>
        </>}
      />
      <Panel pad={false}>
        {PLATFORM_FILTER.has(key) && (
          <div className="border-b border-line p-3">
            <Select value={platformId} onChange={(e) => { setPlatformId(e.target.value); setPage(1); }} className="w-auto" aria-label="Platform">
              <option value="">All platforms</option>{platforms.map((p) => <option key={p.id} value={p.id}>{p.platform_name}</option>)}
            </Select>
          </div>
        )}
        {error ? <div className="p-4"><ErrorNote>{error}</ErrorNote></div> : loading && !data ? <Spinner /> : data && data.rows.length === 0 ? <Empty title="This report is empty">Nothing matches right now.</Empty> : data && (
          <>
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead><tr>{data.columns.map((c) => <th key={c.key} className={cn((c.type === "number" || c.type === "percent") && "num")}>{c.label}</th>)}</tr></thead>
                <tbody>
                  {data.rows.map((r, i) => (
                    <tr key={i}>
                      {data.columns.map((c) => (
                        <td key={c.key} className={cn("max-w-[380px]", (c.type === "number" || c.type === "percent") && "num")}>
                          {c.key === "file_name" && r._import_id ? <Link href={`/import/${r._import_id}`} className="font-medium text-canopy-700 hover:underline">{String(r[c.key])}</Link>
                            : <div className="line-clamp-2" title={typeof r[c.key] === "string" ? (r[c.key] as string) : undefined}><Cell col={c} row={r} /></div>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
          </>
        )}
      </Panel>
    </>
  );
}
