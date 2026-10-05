"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Check, Download, FileUp, MoreHorizontal, Plus, X } from "lucide-react";
import { useRef, useState } from "react";
import { apiFetch, fmtNum, qs, useApi, useDebounced } from "@/components/api";
import { MasterFormModal } from "@/components/MasterFormModal";
import { usePlatforms } from "@/components/platforms";
import { useSession } from "@/components/session";
import {
  Badge, Button, Checkbox, cn, Empty, ErrorNote, Input, LinkButton, MasterTag, Menu, Modal, Note, PageHeader, Pagination, Panel, PlatformMark,
  Select, SkuTag, SortTh, Spinner, StatusBadge, useFeedback,
} from "@/components/ui";
import type { MasterRow } from "@/server/masters";
import type { Paged } from "@/server/types";

type ListData = Paged<MasterRow> & { activePlatforms: number; facets: { categories: string[] } };

function ImportMastersModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const fb = useFeedback();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [res, setRes] = useState<{ total: number; created: number; updated: number; unchanged: number; errors: { row: number; message: string }[]; dryRun: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (f: File, dryRun: boolean) => {
    setBusy(true); setError(null);
    try {
      const form = new FormData();
      form.set("file", f);
      if (dryRun) form.set("dryRun", "1");
      const r = await apiFetch<NonNullable<typeof res>>("/api/masters/import", { form });
      setRes(r);
      if (!dryRun) { fb.success(`${r.created} Master SKUs created, ${r.updated} updated`); onDone(); }
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  return (
    <Modal
      title="Import Master SKUs from Excel" onClose={onClose} size="lg"
      subtitle="One row per product. Existing Master SKUs are updated, new ones are created."
      footer={<>
        <LinkButton href="/api/masters/template" icon={<Download className="size-3.5" />} className="mr-auto">Download template</LinkButton>
        <Button onClick={onClose}>{res && !res.dryRun ? "Close" : "Cancel"}</Button>
        {res?.dryRun && file && <Button variant="primary" loading={busy} disabled={res.created + res.updated === 0} onClick={() => run(file, false)}>Import {res.created + res.updated} Master SKUs</Button>}
      </>}
    >
      <div className="space-y-4">
        {error && <ErrorNote>{error}</ErrorNote>}
        <input ref={input} type="file" accept=".xlsx,.xls,.csv" hidden onChange={(e) => { const f = e.target.files?.[0] ?? null; setFile(f); setRes(null); if (f) run(f, true); }} />
        <button type="button" onClick={() => input.current?.click()} className="flex w-full flex-col items-center gap-1 rounded-lg border border-dashed border-line px-4 py-7 text-[13.5px] hover:border-canopy-600 hover:bg-canopy-50">
          <FileUp className="size-5 text-ink-3" />
          <span className="font-medium">{file ? file.name : "Choose an Excel or CSV file"}</span>
          <span className="text-[12.5px] text-ink-3">Needs at least the columns Master SKU and Product Name</span>
        </button>
        {busy && <Spinner label="Checking the file…" />}
        {res && (
          <>
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-5">
              {[["Rows", res.total], ["New", res.created], ["Updated", res.updated], ["Unchanged", res.unchanged], ["Errors", res.errors.length]].map(([k, v]) => (
                <div key={k} className="bg-card px-3 py-2"><p className="text-[12px] text-ink-3">{k}</p><p className={cn("tnum text-[18px] font-semibold", k === "Errors" && (v as number) > 0 && "text-unmapped")}>{v}</p></div>
              ))}
            </div>
            {res.dryRun && <Note>Nothing has been saved yet. Review the numbers, then import.</Note>}
            {res.errors.length > 0 && (
              <div className="max-h-48 overflow-y-auto rounded-md border border-line">
                <table className="tbl"><thead><tr><th className="w-20">File row</th><th>Problem</th></tr></thead>
                  <tbody>{res.errors.map((e) => <tr key={e.row}><td className="tnum">{e.row}</td><td>{e.message}</td></tr>)}</tbody></table>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

export default function MastersPage() {
  const sp = useSearchParams();
  const fb = useFeedback();
  const { can, me } = useSession();
  const { platforms } = usePlatforms();
  const active = platforms.filter((p) => p.status === "ACTIVE");
  const [q, setQ] = useState(sp.get("q") ?? "");
  const [status, setStatus] = useState("");
  const [category, setCategory] = useState("");
  const [coverage, setCoverage] = useState(sp.get("coverage") ?? "");
  const [missing, setMissing] = useState(sp.get("missingPlatformId") ?? "");
  const [deleted, setDeleted] = useState(false);
  const [compactChoice, setCompactChoice] = useState<boolean | null>(null);
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" }>({ key: "master_sku", dir: "asc" });
  const [page, setPage] = useState(1);
  const [form, setForm] = useState<{ master?: MasterRow } | null>(null);
  const [importing, setImporting] = useState(false);
  const dq = useDebounced(q);
  const compact = compactChoice ?? active.length > 4;

  const path = `/api/masters${qs({ q: dq, status, category, coverage, missingPlatformId: missing, deleted: deleted ? "only" : "", sort: sort.key, dir: sort.dir, page, pageSize: 50 })}`;
  const { data, loading, error, reload } = useApi<ListData>(path);
  const reset = () => setPage(1);

  const remove = async (m: MasterRow) => {
    const ok = await fb.confirm({
      title: `Delete ${m.master_sku}?`, danger: true, confirmLabel: "Delete Master SKU",
      body: m.listing_count ? `Its ${m.listing_count} listing${m.listing_count === 1 ? "" : "s"} will not be deleted. They move to Unmapped SKUs as "Re-mapping required" until you map them again. You can restore this Master SKU later.` : "You can restore it later from the deleted list.",
    });
    if (!ok) return;
    try { await apiFetch(`/api/masters/${m.id}`, { method: "DELETE" }); fb.success(`${m.master_sku} deleted`); reload(); } catch (e) { fb.error((e as Error).message); }
  };
  const restore = async (m: MasterRow) => {
    try { await apiFetch(`/api/masters/${m.id}/restore`, { method: "POST", body: {} }); fb.success(`${m.master_sku} restored`); reload(); } catch (e) { fb.error((e as Error).message); }
  };

  return (
    <>
      <PageHeader
        title="Master SKUs"
        description="One permanent internal code for every real product. Each row shows where that product is listed."
        actions={<>
          {can("export.run") && <LinkButton href="/api/reports/consolidated?format=xlsx" icon={<Download className="size-3.5" />}>Export</LinkButton>}
          {can("master.write") && <Button icon={<FileUp className="size-3.5" />} onClick={() => setImporting(true)}>Import from Excel</Button>}
          {can("master.write") && <Button variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setForm({})}>Add Master SKU</Button>}
        </>}
      />
      <Panel pad={false}>
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <Input value={q} onChange={(e) => { setQ(e.target.value); reset(); }} placeholder="Search Master SKU, product, model, or any Child SKU / ASIN / FSN" className="w-full sm:w-[340px]" aria-label="Search Master SKUs" />
          <Select value={coverage} onChange={(e) => { setCoverage(e.target.value); reset(); }} className="w-auto" aria-label="Coverage">
            <option value="">Any coverage</option><option value="complete">On every active platform</option><option value="missing">Missing a platform</option><option value="none">No listings at all</option>
          </Select>
          <Select value={missing} onChange={(e) => { setMissing(e.target.value); reset(); }} className="w-auto" aria-label="Missing on platform">
            <option value="">Missing on…</option>{active.map((p) => <option key={p.id} value={p.id}>Not on {p.platform_name}</option>)}
          </Select>
          <Select value={category} onChange={(e) => { setCategory(e.target.value); reset(); }} className="w-auto" aria-label="Category">
            <option value="">All categories</option>{data?.facets.categories.map((c) => <option key={c}>{c}</option>)}
          </Select>
          <Select value={status} onChange={(e) => { setStatus(e.target.value); reset(); }} className="w-auto" aria-label="Status">
            <option value="">Any status</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option><option value="DISCONTINUED">Discontinued</option>
          </Select>
          <div className="ml-auto flex items-center gap-3">
            {can("master.delete") && <Checkbox label="Deleted" checked={deleted} onChange={(e) => { setDeleted(e.target.checked); reset(); }} />}
            <div className="flex overflow-hidden rounded-md border border-line text-[12.5px]" role="group" aria-label="Table layout">
              <button type="button" aria-pressed={!compact} onClick={() => setCompactChoice(false)} className={cn("px-2.5 py-1.5", !compact ? "bg-canopy-800 text-white" : "bg-white text-ink-2 hover:bg-canopy-50")}>Platform columns</button>
              <button type="button" aria-pressed={compact} onClick={() => setCompactChoice(true)} className={cn("px-2.5 py-1.5", compact ? "bg-canopy-800 text-white" : "bg-white text-ink-2 hover:bg-canopy-50")}>Compact</button>
            </div>
          </div>
        </div>
        {error ? <div className="p-4"><ErrorNote>{error}</ErrorNote></div> : loading && !data ? <Spinner /> : data && data.rows.length === 0 ? (
          <Empty
            title={dq || coverage || missing || status || category || deleted ? "No Master SKU matches these filters" : "No Master SKUs yet"}
            action={!dq && can("master.write") ? <><Button variant="primary" onClick={() => setForm({})}>Add Master SKU</Button><Button onClick={() => setImporting(true)}>Import from Excel</Button></> : undefined}
          >
            {dq ? "Try a shorter search, or clear the filters." : "Create them one by one, import a sheet, or go to Unmapped SKUs and create a Master SKU straight from a marketplace listing."}
          </Empty>
        ) : data && (
          <>
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead>
                  <tr>
                    <SortTh label="Master SKU" sortKey="master_sku" sort={sort.key} dir={sort.dir} onSort={(key, dir) => setSort({ key, dir })} />
                    <SortTh label="Product" sortKey="product_name" sort={sort.key} dir={sort.dir} onSort={(key, dir) => setSort({ key, dir })} />
                    {compact ? <SortTh label="Platforms mapped" sortKey="coverage" sort={sort.key} dir={sort.dir} onSort={(key, dir) => setSort({ key, dir })} />
                      : active.map((p) => <th key={p.id}><span className="inline-flex items-center gap-1.5"><PlatformMark name={p.platform_name} color={p.brand_color} logo={p.logo} size={16} />{p.platform_name}</span></th>)}
                    <th>Overall status</th>
                    <th className="w-[1%]"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((m) => {
                    const covered = active.filter((p) => m.platforms[String(p.id)]).length;
                    return (
                      <tr key={m.id}>
                        <td className="whitespace-nowrap">
                          <div className="flex items-center gap-2.5">
                            {m.image
                              // eslint-disable-next-line @next/next/no-img-element
                              ? <img src={m.image} alt="" className="size-8 rounded border border-line object-cover" />
                              : <span className="flex size-8 items-center justify-center rounded border border-line bg-paper font-mono text-[10px] text-ink-3">{m.master_sku.slice(0, 2)}</span>}
                            <MasterTag id={m.is_deleted ? null : m.id} sku={m.master_sku} />
                          </div>
                        </td>
                        <td className="min-w-[200px] max-w-[300px]">
                          <Link href={`/masters/${m.id}`} className="font-medium hover:text-canopy-700 hover:underline">{m.product_name}</Link>
                          <p className="truncate text-[12px] text-ink-3">{[m.model, m.color, m.category].filter(Boolean).join(" · ") || "—"}</p>
                        </td>
                        {compact ? (
                          <td>
                            <div className="flex items-center gap-2">
                              <span className="tnum text-[13px] font-medium">{covered} / {active.length}</span>
                              <span className="flex gap-1">{active.map((p) => <span key={p.id} title={`${p.platform_name}: ${m.platforms[String(p.id)] ? `${m.platforms[String(p.id)].count} listing(s)` : "not listed"}`} className={cn(!m.platforms[String(p.id)] && "opacity-20 grayscale")}><PlatformMark name={p.platform_name} color={p.brand_color} logo={p.logo} size={16} /></span>)}</span>
                            </div>
                          </td>
                        ) : active.map((p) => {
                          const cell = m.platforms[String(p.id)];
                          return (
                            <td key={p.id} className="max-w-[190px]">
                              {cell ? (
                                <span className="flex items-center gap-1.5">
                                  <SkuTag className="max-w-[140px]" title={cell.sku}>{cell.sku}</SkuTag>
                                  {cell.count > 1 && <span className="tnum text-[11.5px] text-ink-3" title={`${cell.count} listings on ${p.platform_name}`}>+{cell.count - 1}</span>}
                                </span>
                              ) : <span className="inline-flex items-center gap-1 whitespace-nowrap text-[12px] text-ink-3"><X className="size-3" />Not listed</span>}
                            </td>
                          );
                        })}
                        <td className="whitespace-nowrap">
                          {m.is_deleted ? <Badge tone="unmapped">Deleted</Badge>
                            : m.listing_count === 0 ? <Badge tone="neutral">No listings</Badge>
                            : covered >= active.length ? <Badge tone="mapped"><Check className="size-3" />Complete</Badge>
                            : <Badge tone="review">Missing {active.length - covered}</Badge>}
                          {m.status !== "ACTIVE" && <span className="ml-1.5"><StatusBadge status={m.status} /></span>}
                        </td>
                        <td>
                          <Menu items={[
                            { label: "Open", onClick: () => { window.location.href = `/masters/${m.id}`; }, hidden: m.is_deleted },
                            { label: "Edit", onClick: () => setForm({ master: m }), hidden: !can("master.write") || m.is_deleted },
                            { label: "Delete", danger: true, onClick: () => remove(m), hidden: !can("master.delete") || m.is_deleted },
                            { label: "Restore", onClick: () => restore(m), hidden: !can("master.delete") || !m.is_deleted },
                          ]}><MoreHorizontal className="size-4" /></Menu>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
          </>
        )}
      </Panel>
      <p className="mt-2 text-[12px] text-ink-3">{data ? `${fmtNum(data.total)} Master SKUs` : ""}{active.length ? ` · ${active.length} active platforms` : ""}</p>
      {form && <MasterFormModal master={form.master as never} defaultBrand={me.company.brand} onClose={() => setForm(null)} onSaved={(id) => { setForm(null); if (form.master) reload(); else window.location.href = `/masters/${id}`; }} />}
      {importing && <ImportMastersModal onClose={() => setImporting(false)} onDone={reload} />}
    </>
  );
}
