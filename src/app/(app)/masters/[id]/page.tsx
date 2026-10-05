"use client";
import { useParams, useRouter } from "next/navigation";
import { Check, ExternalLink, MoreHorizontal, Pencil, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { apiFetch, fmtDate, fmtDateTime, useApi } from "@/components/api";
import { ListingFormModal } from "@/components/ListingFormModal";
import { HistoryDialog } from "@/components/ListingsTable";
import { MapDialog } from "@/components/MapDialog";
import { MasterFormModal } from "@/components/MasterFormModal";
import { usePlatforms } from "@/components/platforms";
import { useSession } from "@/components/session";
import {
  Badge, Button, cn, Empty, ErrorNote, MappingBadge, Menu, PageHeader, Panel, PlatformMark, SkuTag, Spinner, StatusBadge, Tabs, useFeedback,
} from "@/components/ui";
import type { AuditRow } from "@/server/audit";
import type { ListingRow } from "@/server/listings";
import type { getMaster } from "@/server/masters";
import type { Paged } from "@/server/types";

type Data = Awaited<ReturnType<typeof getMaster>>;

function Attr({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-[12px] text-ink-3">{label}</dt>
      <dd className="text-[13.5px]">{value || <span className="text-ink-3">—</span>}</dd>
    </div>
  );
}

function AuditChange({ a }: { a: AuditRow }) {
  const o = (a.old_value ?? {}) as Record<string, unknown>, n = (a.new_value ?? {}) as Record<string, unknown>;
  const keys = [...new Set([...Object.keys(o), ...Object.keys(n)])].slice(0, 8);
  if (!keys.length) return null;
  const show = (v: unknown) => (v === null || v === undefined || v === "" ? "empty" : typeof v === "object" ? JSON.stringify(v) : String(v));
  return (
    <ul className="mt-1 space-y-0.5 text-[12px] text-ink-2">
      {keys.map((k) => <li key={k}><span className="text-ink-3">{k.replace(/_/g, " ")}: </span>{k in o && <><span className="line-through decoration-ink-3/50">{show(o[k])}</span> → </>}<span className="font-medium">{show(n[k])}</span></li>)}
    </ul>
  );
}

export default function MasterDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const fb = useFeedback();
  const { can, refreshCounts } = useSession();
  const { platforms } = usePlatforms();
  const { data, error, loading, reload } = useApi<Data>(`/api/masters/${id}`);
  const [tab, setTab] = useState<"listings" | "compare" | "history">("listings");
  const [editMaster, setEditMaster] = useState(false);
  const [addFor, setAddFor] = useState<{ platformId?: number } | null>(null);
  const [editListing, setEditListing] = useState<ListingRow | null>(null);
  const [remap, setRemap] = useState<ListingRow | null>(null);
  const [history, setHistory] = useState<ListingRow | null>(null);
  const audit = useApi<Paged<AuditRow>>(tab === "history" && can("audit.view") ? `/api/audit?entityType=master&entityId=${id}&pageSize=100` : null);

  if (loading && !data) return <Spinner />;
  if (error || !data) return <ErrorNote>{error ?? "Master SKU not found."}</ErrorNote>;
  const { master: m, listings, coverage } = data;
  const fieldsOf = (platformId: number) => platforms.find((p) => p.id === platformId)?.fields ?? [];
  const groups = data.platforms.map((p) => ({ platform: p, items: listings.filter((l) => l.platform_id === p.id) })).filter((g) => g.items.length > 0);

  const act = async (l: ListingRow, path: string, ok: string, method = "POST", body: unknown = {}) => {
    try {
      await apiFetch(`/api/listings/${l.id}${path}`, { method, body: method === "DELETE" ? undefined : body });
      fb.success(ok); refreshCounts(); reload();
    } catch (e) { fb.error((e as Error).message); }
  };
  const removeMaster = async () => {
    const ok = await fb.confirm({
      title: `Delete ${m.master_sku}?`, danger: true, confirmLabel: "Delete Master SKU",
      body: listings.length ? `Its ${listings.length} listings are kept and flagged "Re-mapping required" in Unmapped SKUs. You can restore this Master SKU later.` : "You can restore it later from Master SKUs → Deleted.",
    });
    if (!ok) return;
    try { await apiFetch(`/api/masters/${m.id}`, { method: "DELETE" }); fb.success(`${m.master_sku} deleted`); router.push("/masters"); } catch (e) { fb.error((e as Error).message); }
  };

  // Comparison: one column per listing, rows are the union of standard and platform-specific fields.
  const customLabels = [...new Set(listings.flatMap((l) => fieldsOf(l.platform_id).filter((f) => l.custom[String(f.id)]).map((f) => f.field_label)))];
  const customValue = (l: ListingRow, label: string) => { const f = fieldsOf(l.platform_id).find((x) => x.field_label === label); return f ? l.custom[String(f.id)] ?? null : null; };
  const compareRows: { label: string; get: (l: ListingRow) => React.ReactNode; mono?: boolean }[] = [
    { label: "Child SKU", get: (l) => l.child_sku, mono: true },
    { label: "Listing name", get: (l) => l.listing_name },
    { label: "Product ID", get: (l) => l.product_id && <>{l.product_id} <span className="font-sans text-[11.5px] text-ink-3">{fieldsOf(l.platform_id).find((f) => f.is_primary_identifier)?.field_label}</span></>, mono: true },
    { label: "Listing ID", get: (l) => l.listing_id, mono: true },
    { label: "Seller SKU", get: (l) => l.seller_sku, mono: true },
    ...customLabels.map((label) => ({ label, get: (l: ListingRow) => customValue(l, label), mono: true })),
    { label: "Variant", get: (l) => l.variant }, { label: "Color", get: (l) => l.color }, { label: "Size", get: (l) => l.size },
    { label: "Status", get: (l) => <StatusBadge status={l.listing_status} /> },
    { label: "Mapping", get: (l) => <MappingBadge status={l.mapping_status} confidence={l.mapping_confidence} /> },
    { label: "Listing link", get: (l) => l.open_url && <a href={l.open_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-canopy-700 hover:underline">Open <ExternalLink className="size-3" /></a> },
  ];

  return (
    <>
      <PageHeader
        back={{ href: "/masters", label: "Master SKUs" }}
        title={m.product_name}
        actions={<>
          {can("listing.write") && !m.is_deleted && <Button variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setAddFor({})}>Add platform listing</Button>}
          {can("master.write") && !m.is_deleted && <Button icon={<Pencil className="size-3.5" />} onClick={() => setEditMaster(true)}>Edit</Button>}
          {can("master.delete") && !m.is_deleted && <Button variant="danger" icon={<Trash2 className="size-3.5" />} onClick={removeMaster}>Delete</Button>}
        </>}
      />
      {m.is_deleted && <ErrorNote className="mb-4">This Master SKU is deleted. Restore it from Master SKUs → Deleted to use it again.</ErrorNote>}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Panel>
          <div className="flex flex-col gap-5 sm:flex-row">
            <div className="shrink-0">
              {m.image
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={m.image} alt={m.product_name} className="size-36 rounded-lg border border-line object-cover" />
                : <div className="flex size-36 flex-col items-center justify-center rounded-lg border border-dashed border-line bg-paper text-center text-[12px] text-ink-3"><span className="font-mono text-[22px] text-ink-3/60">{m.master_sku.split("-")[1]?.slice(0, 3) ?? "SKU"}</span>No image</div>}
              {data.images.length > 0 && (
                <div className="mt-2 flex max-w-36 flex-wrap gap-1.5">
                  {data.images.map((img) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <a key={img.id} href={img.image} target="_blank" rel="noopener noreferrer"><img src={img.image} alt="" className="size-10 rounded border border-line object-cover" /></a>
                  ))}
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="rounded-[4px] bg-canopy-900 px-2.5 py-1 font-mono text-[17px] font-medium tracking-wide text-white">{m.master_sku}</span>
                <StatusBadge status={m.status} />
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-4">
                <Attr label="Category" value={m.category} /><Attr label="Model" value={m.model} /><Attr label="Color" value={m.color} />
                <Attr label="Brand" value={m.brand} /><Attr label="Product type" value={m.product_type} /><Attr label="Material" value={m.material} />
                <Attr label="Size" value={m.size} /><Attr label="Variant" value={m.variant} /><Attr label="Internal code" value={m.internal_code} />
                <Attr label="Created" value={fmtDate(m.created_at)} /><Attr label="Updated" value={fmtDate(m.updated_at)} />
              </dl>
              {m.remarks && <p className="mt-3 border-t border-line-2 pt-3 text-[13px] text-ink-2">{m.remarks}</p>}
            </div>
          </div>
        </Panel>

        <Panel title="Platform coverage">
          <p className="tnum text-[30px] font-semibold leading-none tracking-[-0.02em]">{coverage.covered} <span className="text-ink-3">/ {coverage.total}</span></p>
          <p className="mt-1 text-[12.5px] text-ink-3">active platforms carry this product</p>
          <ul className="mt-3 space-y-1.5">
            {data.platforms.filter((p) => p.status === "ACTIVE").map((p) => {
              const n = listings.filter((l) => l.platform_id === p.id).length;
              return (
                <li key={p.id} className="flex items-center gap-2 text-[13px]">
                  <span className={cn("flex size-4 items-center justify-center rounded-full", n ? "bg-mapped text-white" : "bg-line text-ink-3")}>{n ? <Check className="size-3" /> : <X className="size-3" />}</span>
                  <PlatformMark name={p.platform_name} color={p.brand_color} logo={p.logo} size={16} />
                  <span className={cn("flex-1", !n && "text-ink-3")}>{p.platform_name}</span>
                  {n ? <span className="tnum text-[12px] text-ink-3">{n} listing{n === 1 ? "" : "s"}</span>
                    : can("listing.write") && !m.is_deleted ? <button type="button" onClick={() => setAddFor({ platformId: p.id })} className="text-[12px] font-medium text-canopy-700 hover:underline">Add listing</button>
                    : <span className="text-[12px] text-ink-3">Missing</span>}
                </li>
              );
            })}
          </ul>
          {coverage.missing.length > 0 && <p className="mt-3 border-t border-line-2 pt-3 text-[12.5px] text-ink-2"><span className="font-medium">Missing:</span> {coverage.missing.map((x) => x.platform_name).join(", ")}</p>}
        </Panel>
      </div>

      <div className="mt-6">
        <Tabs
          value={tab} onChange={setTab}
          tabs={[
            { value: "listings", label: "Connected listings", count: listings.length },
            { value: "compare", label: "Compare platforms" },
            ...(can("audit.view") ? [{ value: "history" as const, label: "Change history" }] : []),
          ]}
        />

        {tab === "listings" && (listings.length === 0 ? (
          <Panel><Empty title="No marketplace listing is linked yet" action={can("listing.write") && !m.is_deleted ? <Button variant="primary" onClick={() => setAddFor({})}>Add platform listing</Button> : undefined}>Add a listing here, or map Child SKUs to this Master SKU from Unmapped SKUs.</Empty></Panel>
        ) : (
          <div className="relative pl-6">
            {/* The trunk: one Master SKU, a branch per platform, a leaf per Child SKU. */}
            <span aria-hidden className="absolute bottom-6 left-[7px] top-1 w-px bg-line" />
            {groups.map(({ platform: p, items }) => (
              <section key={p.id} className="relative mb-5">
                <span aria-hidden className="absolute -left-6 top-[9px] size-[15px] rounded-full border-[3px] border-paper" style={{ background: p.brand_color || "#5b6b64" }} />
                <h3 className="mb-2 flex items-center gap-2 text-[14px] font-semibold">
                  <PlatformMark name={p.platform_name} color={p.brand_color} logo={p.logo} size={20} />{p.platform_name}
                  <span className="tnum text-[12px] font-normal text-ink-3">{items.length} listing{items.length === 1 ? "" : "s"}</span>
                  {p.status !== "ACTIVE" && <StatusBadge status={p.status} />}
                </h3>
                <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                  {items.map((l) => {
                    const fields = fieldsOf(l.platform_id).filter((f) => l.custom[String(f.id)]);
                    const ids = fields.filter((f) => f.is_primary_identifier || f.use_for_matching || f.searchable);
                    return (
                      <article key={l.id} className="flex flex-col rounded-lg border border-line bg-card" style={{ borderLeft: `3px solid ${p.brand_color || "#5b6b64"}` }}>
                        <div className="flex-1 px-3.5 py-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-[11.5px] text-ink-3">Child SKU</p>
                              <p className="truncate font-mono text-[14px] font-medium" title={l.child_sku}>{l.child_sku}</p>
                            </div>
                            <div className="flex shrink-0 items-center gap-1.5">
                              <StatusBadge status={l.listing_status} />
                              {l.mapping_status !== "MAPPED" && <MappingBadge status={l.mapping_status} />}
                            </div>
                          </div>
                          <p className="mt-2 text-[11.5px] text-ink-3">Listing name</p>
                          <p className="line-clamp-2 text-[13px]" title={l.listing_name ?? undefined}>{l.listing_name || "—"}</p>
                          <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5">
                            {l.product_id && !ids.some((f) => f.is_primary_identifier) && <div><dt className="text-[11.5px] text-ink-3">Product ID</dt><dd className="truncate font-mono text-[12.5px]">{l.product_id}</dd></div>}
                            {ids.map((f) => <div key={f.id}><dt className="text-[11.5px] text-ink-3">{f.field_label}</dt><dd className="truncate font-mono text-[12.5px]" title={l.custom[String(f.id)]}>{l.custom[String(f.id)]}</dd></div>)}
                            {l.listing_id && <div className="col-span-2"><dt className="text-[11.5px] text-ink-3">Listing ID</dt><dd className="truncate font-mono text-[12.5px]" title={l.listing_id}>{l.listing_id}</dd></div>}
                          </dl>
                        </div>
                        <div className="flex items-center gap-1.5 border-t border-line-2 px-2.5 py-2">
                          {l.open_url ? <a href={l.open_url} target="_blank" rel="noopener noreferrer" className="inline-flex h-7 items-center gap-1 rounded-md border border-line px-2.5 text-[12.5px] font-medium hover:bg-canopy-50">Open listing <ExternalLink className="size-3" /></a>
                            : <span className="px-1 text-[12px] text-ink-3">No listing link</span>}
                          {can("listing.write") && <Button size="sm" onClick={() => setEditListing(l)}>Edit</Button>}
                          <span className="ml-auto" />
                          <Menu items={[
                            { label: "Change Master SKU", onClick: () => setRemap(l), hidden: !can("mapping.write") },
                            { label: "Flag for re-mapping", onClick: () => act(l, "/request-remap", "Flagged for re-mapping", "POST", { note: "Flagged as wrongly mapped" }), hidden: !can("mapping.write") || l.mapping_status !== "MAPPED" },
                            { label: "Remove mapping", onClick: () => act(l, "/unmap", `${l.child_sku} moved back to Unmapped SKUs`), hidden: !can("mapping.write") },
                            { label: "Mapping history", onClick: () => setHistory(l) },
                            { label: "Delete listing", danger: true, hidden: !can("listing.delete"), onClick: async () => { if (await fb.confirm({ title: `Delete ${l.child_sku}?`, body: "The listing is hidden but kept in the database. You can restore it from All Listings → Deleted.", danger: true, confirmLabel: "Delete listing" })) act(l, "", "Listing deleted", "DELETE"); } },
                          ]}><MoreHorizontal className="size-4" /></Menu>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        ))}

        {tab === "compare" && (listings.length === 0 ? <Panel><Empty title="Nothing to compare yet">Add listings on at least one platform.</Empty></Panel> : (
          <Panel pad={false}>
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 w-36 bg-[#fafbf9]">Field</th>
                    {listings.map((l) => <th key={l.id} className="min-w-[200px]"><span className="inline-flex items-center gap-1.5 text-ink"><PlatformMark name={l.platform_name} color={l.platform_color} logo={l.platform_logo} size={16} />{l.platform_name}</span></th>)}
                  </tr>
                </thead>
                <tbody>
                  {compareRows.filter((r) => listings.some((l) => r.get(l))).map((r) => (
                    <tr key={r.label}>
                      <td className="sticky left-0 z-10 bg-card font-medium text-ink-2">{r.label}</td>
                      {listings.map((l) => <td key={l.id} className={cn("max-w-[320px]", r.mono && "font-mono text-[12.5px]")}>{r.get(l) || <span className="font-sans text-ink-3">—</span>}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        ))}

        {tab === "history" && (
          <Panel>
            {audit.loading ? <Spinner /> : !audit.data?.rows.length ? <p className="text-[13px] text-ink-3">No changes recorded.</p> : (
              <ol className="space-y-3">
                {audit.data.rows.map((a) => (
                  <li key={a.id} className="border-b border-line-2 pb-3 last:border-0 last:pb-0">
                    <p className="text-[13px]"><span className="font-medium">{a.user_name ?? "System"}</span> <Badge>{a.action.replace(/_/g, " ").toLowerCase()}</Badge> <span className="text-[12px] text-ink-3">{fmtDateTime(a.created_at)}</span></p>
                    <AuditChange a={a} />
                  </li>
                ))}
              </ol>
            )}
            <p className="mt-3 text-[12px] text-ink-3">Mapping changes are recorded per listing: open a listing&apos;s menu and choose Mapping history.</p>
          </Panel>
        )}
      </div>

      {editMaster && <MasterFormModal master={m as never} images={data.images.map((i) => i.image)} onClose={() => setEditMaster(false)} onSaved={() => { setEditMaster(false); reload(); }} />}
      {addFor && <ListingFormModal platforms={platforms} fixedPlatformId={addFor.platformId} fixedMaster={{ id: m.id, master_sku: m.master_sku, product_name: m.product_name }} onClose={() => setAddFor(null)} onSaved={() => { setAddFor(null); reload(); }} />}
      {editListing && <ListingFormModal listing={editListing} platforms={platforms} onClose={() => setEditListing(null)} onSaved={() => { setEditListing(null); reload(); }} />}
      {remap && <MapDialog listing={remap} platforms={platforms} onClose={() => setRemap(null)} onDone={() => { setRemap(null); reload(); }} />}
      {history && <HistoryDialog listing={history} onClose={() => setHistory(null)} />}
    </>
  );
}
