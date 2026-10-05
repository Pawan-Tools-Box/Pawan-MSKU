"use client";
import { useState } from "react";
import { fmtDateTime, qs, useApi, useDebounced } from "@/components/api";
import { usePlatforms } from "@/components/platforms";
import { Badge, Empty, ErrorNote, Input, PageHeader, Pagination, Panel, Select, Spinner, type Tone } from "@/components/ui";
import type { AuditRow } from "@/server/audit";
import type { Paged } from "@/server/types";

const ACTIONS: [string, string][] = [
  ["MAPPED", "Mapped"], ["REMAPPED", "Changed Master SKU mapping"], ["UNMAPPED", "Removed mapping"], ["REMAP_REQUESTED", "Flagged for re-mapping"],
  ["BULK_MAPPING", "Bulk mapping"], ["EXCEL_MAPPING", "Excel mapping"], ["AUTO_MATCH_RUN", "Auto-match run"], ["IMPORT_COMPLETED", "Import"], ["EXPORT", "Export"],
  ["MASTER_CREATED", "Master SKU created"], ["MASTER_UPDATED", "Master SKU changed"], ["MASTER_DELETED", "Master SKU deleted"], ["MASTER_RESTORED", "Master SKU restored"], ["MASTER_IMPORT", "Master SKU import"],
  ["PLATFORM_CREATED", "Platform created"], ["PLATFORM_UPDATED", "Platform changed"], ["PLATFORM_STATUS_CHANGED", "Platform status changed"],
  ["PLATFORM_FIELD_ADDED", "Platform field added"], ["PLATFORM_FIELD_UPDATED", "Platform field changed"], ["PLATFORM_FIELD_REMOVED", "Platform field removed"], ["IMPORT_TEMPLATE_SAVED", "Import template saved"], ["IMPORT_TEMPLATE_DELETED", "Import template deleted"],
  ["LISTING_CREATED", "Listing created"], ["LISTING_UPDATED", "Listing changed"], ["LISTING_DELETED", "Listing deleted"], ["LISTING_RESTORED", "Listing restored"],
  ["USER_CREATED", "User created"], ["USER_UPDATED", "User changed"], ["SETTINGS_UPDATED", "Settings changed"], ["LOGIN", "Signed in"], ["LOGOUT", "Signed out"],
];
const LABEL = Object.fromEntries(ACTIONS);
const tone = (a: string): Tone => (a.includes("DELETED") || a === "UNMAPPED" ? "unmapped" : a === "REMAPPED" || a === "REMAP_REQUESTED" ? "remap" : a.startsWith("MAP") || a.includes("MAPPING") || a.includes("RESTORED") ? "mapped" : a.startsWith("IMPORT") || a === "EXPORT" ? "info" : "neutral");
const show = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v));

function Change({ a }: { a: AuditRow }) {
  const o = (a.old_value ?? {}) as Record<string, unknown>, n = (a.new_value ?? {}) as Record<string, unknown>;
  const keys = [...new Set([...Object.keys(o), ...Object.keys(n)])];
  if (!keys.length) return <span className="text-ink-3">—</span>;
  return (
    <dl className="space-y-0.5 text-[12.5px]">
      {keys.slice(0, 6).map((k) => (
        <div key={k} className="flex flex-wrap gap-x-1.5">
          <dt className="text-ink-3">{k.replace(/_/g, " ")}</dt>
          <dd className="min-w-0 break-words">{k in o ? <><span className="text-ink-2">{show(o[k])}</span><span className="px-1 text-ink-3">→</span></> : null}<span className="font-medium">{show(n[k])}</span></dd>
        </div>
      ))}
      {keys.length > 6 && <p className="text-ink-3">and {keys.length - 6} more fields</p>}
    </dl>
  );
}

export default function AuditPage() {
  const { platforms } = usePlatforms();
  const [q, setQ] = useState("");
  const [action, setAction] = useState("");
  const [platformId, setPlatformId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const dq = useDebounced(q);
  const { data, loading, error } = useApi<Paged<AuditRow>>(`/api/audit${qs({ q: dq, action, platformId, from, to, page, pageSize: 50 })}`);
  return (
    <>
      <PageHeader title="Audit Logs" description="Who changed what, and when. Mapping changes record the old and the new Master SKU." />
      <Panel pad={false}>
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Search SKU, user or value" className="w-full sm:w-[260px]" aria-label="Search audit log" />
          <Select value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }} className="w-auto" aria-label="Action"><option value="">All actions</option>{ACTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>
          <Select value={platformId} onChange={(e) => { setPlatformId(e.target.value); setPage(1); }} className="w-auto" aria-label="Platform"><option value="">All platforms</option>{platforms.map((p) => <option key={p.id} value={p.id}>{p.platform_name}</option>)}</Select>
          <label className="flex items-center gap-1.5 text-[12.5px] text-ink-3">From <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} className="w-auto" /></label>
          <label className="flex items-center gap-1.5 text-[12.5px] text-ink-3">To <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} className="w-auto" /></label>
        </div>
        {error ? <div className="p-4"><ErrorNote>{error}</ErrorNote></div> : loading && !data ? <Spinner /> : !data?.rows.length ? <Empty title="No audit entries match">Change the filters to see more.</Empty> : (
          <>
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead><tr><th>Date</th><th>User</th><th>Action</th><th>Platform</th><th>Record</th><th>Old → New</th></tr></thead>
                <tbody>
                  {data.rows.map((a) => (
                    <tr key={a.id}>
                      <td className="whitespace-nowrap text-ink-2">{fmtDateTime(a.created_at)}</td>
                      <td className="whitespace-nowrap font-medium">{a.user_name ?? "System"}</td>
                      <td><Badge tone={tone(a.action)}>{LABEL[a.action] ?? a.action}</Badge></td>
                      <td className="whitespace-nowrap">{a.platform_name ?? <span className="text-ink-3">—</span>}</td>
                      <td className="max-w-[260px] break-words font-mono text-[12.5px]">{a.entity_label ?? "—"}</td>
                      <td className="min-w-[260px] max-w-[460px]"><Change a={a} /></td>
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
