"use client";
import { Download, FileUp, RefreshCw, Save } from "lucide-react";
import { useRef, useState } from "react";
import { apiFetch, fmtNum, qs, useApi, useDebounced } from "@/components/api";
import { MasterPicker, type MasterOption } from "@/components/MasterPicker";
import { usePlatforms } from "@/components/platforms";
import { useSession } from "@/components/session";
import {
  Button, cn, Empty, ErrorNote, Input, LinkButton, MappingBadge, MasterTag, Note, PageHeader, Pagination, Panel, PlatformName, Select, SkuTag,
  Spinner, Tabs, useFeedback,
} from "@/components/ui";
import type { ListingRow } from "@/server/listings";
import type { ExcelMappingResult } from "@/server/mapping-excel";
import type { Paged } from "@/server/types";

const STATUS_OPTIONS = [
  { value: "UNMAPPED,NEEDS_REVIEW,REMAPPING_REQUIRED", label: "Everything not mapped" },
  { value: "UNMAPPED", label: "Unmapped" }, { value: "NEEDS_REVIEW", label: "Needs review" },
  { value: "REMAPPING_REQUIRED", label: "Re-mapping required" }, { value: "MAPPED", label: "Mapped (to change)" }, { value: "", label: "All listings" },
];

function BulkGrid() {
  const fb = useFeedback();
  const { refreshCounts } = useSession();
  const { platforms } = usePlatforms();
  const [q, setQ] = useState("");
  const [platformId, setPlatformId] = useState("");
  const [status, setStatus] = useState(STATUS_OPTIONS[0].value);
  const [page, setPage] = useState(1);
  const [choice, setChoice] = useState<Map<number, MasterOption>>(new Map());
  const [rowErrors, setRowErrors] = useState<Map<number, string>>(new Map());
  const [busy, setBusy] = useState(false);
  const dq = useDebounced(q);
  const { data, loading, error, reload } = useApi<Paged<ListingRow>>(`/api/listings${qs({ q: dq, platformId, mappingStatus: status, page, pageSize: 50, sort: "listing_name", dir: "asc" })}`);

  const set = (id: number, m: MasterOption | null) => setChoice((prev) => { const n = new Map(prev); if (m) n.set(id, m); else n.delete(id); return n; });
  const useSuggestions = () => setChoice((prev) => {
    const n = new Map(prev);
    for (const r of data?.rows ?? []) if (!n.has(r.id) && r.suggested_master_id) n.set(r.id, { id: r.suggested_master_id, master_sku: r.suggested_master_sku!, product_name: r.suggested_master_name ?? "" });
    return n;
  });
  const save = async () => {
    setBusy(true); setRowErrors(new Map());
    try {
      const r = await apiFetch<{ ok: boolean; updated: number; unchanged: number; errors: { listingId: number; message: string }[] }>("/api/mapping/bulk", {
        body: { items: [...choice.entries()].map(([listingId, m]) => ({ listingId, masterId: m.id })) },
      });
      if (!r.ok) {
        setRowErrors(new Map(r.errors.map((e) => [e.listingId, e.message])));
        fb.error(`${r.errors.length} row${r.errors.length === 1 ? " has" : "s have"} a problem. Nothing was saved.`);
        return;
      }
      fb.success(`${r.updated} mapping${r.updated === 1 ? "" : "s"} saved`);
      setChoice(new Map()); reload(); refreshCounts();
    } catch (e) { fb.error((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <Panel pad={false}>
      <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
        <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Search Child SKU, listing name, Product ID…" className="w-full sm:w-[300px]" aria-label="Search" />
        <Select value={platformId} onChange={(e) => { setPlatformId(e.target.value); setPage(1); }} className="w-auto" aria-label="Platform">
          <option value="">All platforms</option>{platforms.map((p) => <option key={p.id} value={p.id}>{p.platform_name}</option>)}
        </Select>
        <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="w-auto" aria-label="Mapping status">
          {STATUS_OPTIONS.map((o) => <option key={o.label} value={o.value}>{o.label}</option>)}
        </Select>
        <div className="ml-auto flex items-center gap-2">
          <Button onClick={useSuggestions} title="Fill the Master SKU column with the system's suggestion where there is one">Fill with suggestions</Button>
          <Button variant="primary" loading={busy} disabled={choice.size === 0} icon={<Save className="size-3.5" />} onClick={save}>Save all mappings{choice.size ? ` (${choice.size})` : ""}</Button>
        </div>
      </div>
      {error ? <div className="p-4"><ErrorNote>{error}</ErrorNote></div> : loading && !data ? <Spinner /> : data && data.rows.length === 0 ? (
        <Empty title="No listing matches these filters">Change the status filter to see mapped listings, or import a marketplace file.</Empty>
      ) : data && (
        <>
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead><tr><th>Platform</th><th>Child SKU</th><th>Listing name</th><th>Current</th><th className="min-w-[320px]">Master SKU to map to</th></tr></thead>
              <tbody>
                {data.rows.map((l) => (
                  <tr key={l.id} className={cn(choice.has(l.id) && "[&>td]:bg-canopy-50/60")}>
                    <td><PlatformName name={l.platform_name} color={l.platform_color} logo={l.platform_logo} /></td>
                    <td className="max-w-[220px]"><SkuTag color={l.platform_color} title={l.child_sku}>{l.child_sku}</SkuTag></td>
                    <td className="min-w-[220px] max-w-[380px]"><p className="line-clamp-2" title={l.listing_name ?? undefined}>{l.listing_name || "—"}</p></td>
                    <td className="whitespace-nowrap">{l.master_sku ? <MasterTag id={l.master_product_id} sku={l.master_sku} /> : <MappingBadge status={l.mapping_status} confidence={l.mapping_confidence} />}</td>
                    <td>
                      <MasterPicker compact value={choice.get(l.id) ?? null} onChange={(m) => set(l.id, m)} placeholder={l.suggested_master_sku ? `Suggested: ${l.suggested_master_sku}` : "Search Master SKU"} />
                      {rowErrors.get(l.id) && <p className="mt-1 text-[12px] text-unmapped">{rowErrors.get(l.id)}</p>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
        </>
      )}
    </Panel>
  );
}

function ExcelMapping() {
  const fb = useFeedback();
  const { refreshCounts } = useSession();
  const { platforms } = usePlatforms();
  const input = useRef<HTMLInputElement>(null);
  const [platformId, setPlatformId] = useState("");
  const [status, setStatus] = useState(STATUS_OPTIONS[0].value);
  const [file, setFile] = useState<File | null>(null);
  const [res, setRes] = useState<ExcelMappingResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (f: File, apply: boolean) => {
    setBusy(true); setError(null);
    try {
      const form = new FormData();
      form.set("file", f);
      if (apply) form.set("apply", "1");
      const r = await apiFetch<ExcelMappingResult>("/api/mapping/excel", { form });
      setRes(r);
      if (apply) { fb.success(`${r.updated} mapping${r.updated === 1 ? "" : "s"} updated from Excel`); refreshCounts(); }
    } catch (e) { setError((e as Error).message); setRes(null); }
    finally { setBusy(false); }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Panel title="1. Download the mapping sheet">
        <p className="text-[13px] text-ink-2">The sheet lists Platform, Child SKU, Listing Name, Current Master SKU and an empty <strong>New Master SKU</strong> column. The system&apos;s suggestion is included to help you.</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Select value={platformId} onChange={(e) => setPlatformId(e.target.value)} className="w-auto" aria-label="Platform">
            <option value="">All platforms</option>{platforms.map((p) => <option key={p.id} value={p.id}>{p.platform_name}</option>)}
          </Select>
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-auto" aria-label="Mapping status">
            {STATUS_OPTIONS.map((o) => <option key={o.label} value={o.value}>{o.label}</option>)}
          </Select>
          <LinkButton href={`/api/mapping/excel${qs({ platformId, mappingStatus: status })}`} variant="primary" icon={<Download className="size-3.5" />}>Download sheet</LinkButton>
        </div>
      </Panel>
      <Panel title="2. Fill in New Master SKU and upload">
        <input ref={input} type="file" accept=".xlsx,.xls,.csv" hidden onChange={(e) => { const f = e.target.files?.[0] ?? null; setFile(f); if (f) run(f, false); e.target.value = ""; }} />
        <button type="button" onClick={() => input.current?.click()} className="flex w-full flex-col items-center gap-1 rounded-lg border border-dashed border-line px-4 py-6 text-[13.5px] hover:border-canopy-600 hover:bg-canopy-50">
          <FileUp className="size-5 text-ink-3" />
          <span className="font-medium">{file ? file.name : "Choose the filled-in sheet"}</span>
          <span className="text-[12.5px] text-ink-3">Rows with an empty New Master SKU are left as they are</span>
        </button>
        {error && <ErrorNote className="mt-3">{error}</ErrorNote>}
        {busy && <Spinner label="Checking the sheet…" />}
        {res && !busy && (
          <div className="mt-3 space-y-3">
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-4">
              {[["Rows in sheet", res.total], [res.applied ? "Updated" : "Will update", res.applied ? res.updated : res.toUpdate], ["Already correct", res.unchanged], ["Errors", res.errors.length]].map(([k, v]) => (
                <div key={k} className="bg-card px-3 py-2"><p className="text-[12px] text-ink-3">{k}</p><p className={cn("tnum text-[18px] font-semibold", k === "Errors" && (v as number) > 0 && "text-unmapped")}>{fmtNum(v as number)}</p></div>
              ))}
            </div>
            {res.errors.length > 0 && (
              <div className="max-h-44 overflow-y-auto rounded-md border border-line">
                <table className="tbl"><thead><tr><th className="w-20">Sheet row</th><th>Child SKU</th><th>Problem</th></tr></thead>
                  <tbody>{res.errors.map((e) => <tr key={e.row}><td className="tnum">{e.row}</td><td className="font-mono text-[12px]">{e.child_sku}</td><td className="text-unmapped">{e.message}</td></tr>)}</tbody></table>
              </div>
            )}
            {!res.applied && res.preview.length > 0 && (
              <div className="max-h-44 overflow-y-auto rounded-md border border-line">
                <table className="tbl"><thead><tr><th>Platform</th><th>Child SKU</th><th>Current</th><th>New</th></tr></thead>
                  <tbody>{res.preview.map((p) => <tr key={p.row}><td>{p.platform}</td><td className="font-mono text-[12px]">{p.child_sku}</td><td>{p.current ? <MasterTag sku={p.current} /> : <span className="text-ink-3">None</span>}</td><td><MasterTag sku={p.next} /></td></tr>)}</tbody></table>
              </div>
            )}
            {!res.applied ? (
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="primary" disabled={!file || res.toUpdate === 0} loading={busy} onClick={() => file && run(file, true)}>Update {fmtNum(res.toUpdate)} mapping{res.toUpdate === 1 ? "" : "s"}</Button>
                {res.errors.length > 0 && <span className="text-[12.5px] text-ink-3">Rows with errors are skipped. Fix them in the sheet and upload again.</span>}
              </div>
            ) : <Note>Done. Every change is in the audit log as an Excel mapping.</Note>}
          </div>
        )}
      </Panel>
    </div>
  );
}

function AutoMatch() {
  const fb = useFeedback();
  const { refreshCounts } = useSession();
  const { platforms } = usePlatforms();
  const settings = useApi<{ settings: { matching: { autoMapThreshold: number; reviewThreshold: number } } }>("/api/settings");
  const [platformId, setPlatformId] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ checked: number; mapped: number; review: number; unmapped: number } | null>(null);
  const m = settings.data?.settings.matching;
  const run = async () => {
    setBusy(true);
    try { setRes(await apiFetch("/api/mapping/rematch", { body: { platformId: platformId ? Number(platformId) : undefined } })); refreshCounts(); }
    catch (e) { fb.error((e as Error).message); }
    finally { setBusy(false); }
  };
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <Panel title="How automatic matching decides" pad={false}>
        <table className="tbl">
          <thead><tr><th>Signal</th><th className="num">Confidence</th></tr></thead>
          <tbody>
            <tr><td>The file names a Master SKU, or the Child SKU is identical to a Master SKU or internal code</td><td className="num">100%</td></tr>
            <tr><td>The exact same SKU is already mapped on another platform</td><td className="num">97%</td></tr>
            <tr><td>The same Product ID is already mapped on this platform (one ASIN, several seller SKUs)</td><td className="num">95%</td></tr>
            <tr><td>A platform identifier marked “use for matching” is already mapped</td><td className="num">93%</td></tr>
            <tr><td>Model, product name and colour of a Master SKU are found in the listing title or SKU</td><td className="num">up to 95%</td></tr>
          </tbody>
        </table>
        <p className="border-t border-line px-4 py-3 text-[13px] text-ink-2">
          At or above <strong>{m?.autoMapThreshold ?? 90}%</strong> a listing is mapped. From <strong>{m?.reviewThreshold ?? 50}%</strong> it goes to Needs Review with the suggestion. Below that it stays Unmapped.
          Name-based matches only map automatically when the model and the colour are both confirmed and no other Master SKU scores close. Existing mappings are never changed by auto-match.
        </p>
      </Panel>
      <Panel title="Run it again">
        <p className="text-[13px] text-ink-2">Useful after you add Master SKUs or map some listings by hand: listings that share a SKU or Product ID with them can now be matched.</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Select value={platformId} onChange={(e) => setPlatformId(e.target.value)} className="w-auto" aria-label="Platform">
            <option value="">All platforms</option>{platforms.map((p) => <option key={p.id} value={p.id}>{p.platform_name}</option>)}
          </Select>
          <Button variant="primary" loading={busy} icon={<RefreshCw className="size-3.5" />} onClick={run}>Re-run auto-match</Button>
        </div>
        {res && (
          <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-line bg-line">
            {[["Checked", res.checked], ["Mapped now", res.mapped], ["Needs review", res.review], ["Still unmapped", res.unmapped]].map(([k, v]) => (
              <div key={k} className="bg-card px-3 py-2"><p className="text-[12px] text-ink-3">{k}</p><p className="tnum text-[18px] font-semibold">{fmtNum(v as number)}</p></div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

export default function MappingPage() {
  const [tab, setTab] = useState<"bulk" | "excel" | "auto">("bulk");
  return (
    <>
      <PageHeader title="SKU Mapping" description="Connect many Child SKUs to their Master SKUs at once: in a grid, through Excel, or by re-running automatic matching." />
      <Tabs value={tab} onChange={setTab} tabs={[{ value: "bulk", label: "Bulk mapping" }, { value: "excel", label: "Excel mapping" }, { value: "auto", label: "Automatic matching" }]} />
      {tab === "bulk" && <BulkGrid />}
      {tab === "excel" && <ExcelMapping />}
      {tab === "auto" && <AutoMatch />}
    </>
  );
}
