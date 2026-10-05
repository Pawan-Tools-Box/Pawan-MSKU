"use client";
import { ExternalLink, MoreHorizontal } from "lucide-react";
import { useState } from "react";
import { apiFetch, fmtDate, fmtDateTime, useApi } from "./api";
import { ListingFormModal } from "./ListingFormModal";
import { MapDialog } from "./MapDialog";
import type { PlatformFull } from "./platforms";
import { useSession } from "./session";
import { Button, Checkbox, cn, MappingBadge, MAPPING_LABEL, MasterTag, Menu, Modal, PlatformName, SkuTag, Spinner, StatusBadge, useFeedback } from "./ui";
import type { ListingRow } from "@/server/listings";

export function HistoryDialog({ listing, onClose }: { listing: ListingRow; onClose: () => void }) {
  const { data, loading } = useApi<{ history: { id: number; old_status: string | null; new_status: string; method: string; confidence: number | null; note: string | null; created_at: string; old_master_sku: string | null; new_master_sku: string | null; user_name: string | null }[] }>(`/api/listings/${listing.id}/history`);
  return (
    <Modal title="Mapping history" subtitle={<><SkuTag color={listing.platform_color}>{listing.child_sku}</SkuTag> on {listing.platform_name}</>} onClose={onClose} size="lg">
      {loading ? <Spinner /> : !data?.history.length ? <p className="py-6 text-center text-[13px] text-ink-3">This listing has never been mapped.</p> : (
        <ol className="space-y-3">
          {data.history.map((h) => (
            <li key={h.id} className="rounded-md border border-line px-3 py-2">
              <div className="flex flex-wrap items-center gap-2 text-[13px]">
                {h.old_master_sku ? <MasterTag sku={h.old_master_sku} /> : <span className="text-ink-3">No Master SKU</span>}
                <span className="text-ink-3">to</span>
                {h.new_master_sku ? <MasterTag sku={h.new_master_sku} /> : <span className="text-ink-3">No Master SKU</span>}
                <MappingBadge status={h.new_status} confidence={h.confidence} />
              </div>
              <p className="mt-1 text-[12px] text-ink-3">{fmtDateTime(h.created_at)} · {h.user_name ?? "System"} · {h.method.toLowerCase().replace(/_/g, " ")}{h.note ? ` · ${h.note}` : ""}</p>
            </li>
          ))}
        </ol>
      )}
    </Modal>
  );
}

export interface ListingsTableProps {
  rows: ListingRow[];
  platforms: PlatformFull[];
  onChanged: () => void;
  selectable?: boolean;
  selected?: Set<number>;
  onSelect?: (next: Set<number>) => void;
  /** Extra columns for the pending queues. */
  showAge?: boolean;
  hidePlatform?: boolean;
  hideMaster?: boolean;
}

/** The one listing table used by All Listings, Unmapped SKUs, Needs Review, search and import detail. */
export function ListingsTable({ rows, platforms, onChanged, selectable, selected, onSelect, showAge, hidePlatform, hideMaster }: ListingsTableProps) {
  const fb = useFeedback();
  const { can, refreshCounts } = useSession();
  const [mapping, setMapping] = useState<ListingRow | null>(null);
  const [editing, setEditing] = useState<ListingRow | null>(null);
  const [history, setHistory] = useState<ListingRow | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const canMap = can("mapping.write");

  const act = async (l: ListingRow, path: string, okText: string, method = "POST", body: unknown = {}) => {
    setBusyId(l.id);
    try {
      await apiFetch(`/api/listings/${l.id}${path}`, { method, body: method === "DELETE" ? undefined : body });
      fb.success(okText);
      refreshCounts();
      onChanged();
    } catch (e) { fb.error((e as Error).message); }
    finally { setBusyId(null); }
  };

  const allSelected = !!selected && rows.length > 0 && rows.every((r) => selected.has(r.id));
  const toggleAll = (on: boolean) => {
    const next = new Set(selected);
    for (const r of rows) { if (on) next.add(r.id); else next.delete(r.id); }
    onSelect?.(next);
  };

  return (
    <>
      <div className="overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr>
              {selectable && <th className="w-8"><Checkbox aria-label="Select all on this page" checked={allSelected} onChange={(e) => toggleAll(e.target.checked)} /></th>}
              {!hidePlatform && <th>Platform</th>}
              <th>Child SKU</th>
              <th>Listing name</th>
              <th>{hideMaster ? "Mapping" : "Master SKU and mapping"}</th>
              {!showAge && <th>Listing</th>}
              {showAge && <th>Imported · days pending</th>}
              <th className="w-[1%]"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((l) => {
              const fields = platforms.find((p) => p.id === l.platform_id)?.fields ?? [];
              const primary = fields.find((x) => x.is_primary_identifier);
              return (
                <tr key={l.id} className={cn(l.is_deleted && "opacity-60")}>
                  {selectable && <td><Checkbox aria-label={`Select ${l.child_sku}`} checked={selected?.has(l.id) ?? false} onChange={(e) => { const n = new Set(selected); if (e.target.checked) n.add(l.id); else n.delete(l.id); onSelect?.(n); }} /></td>}
                  {!hidePlatform && <td><PlatformName name={l.platform_name} color={l.platform_color} logo={l.platform_logo} /></td>}
                  <td className="max-w-[210px]">
                    <SkuTag color={hidePlatform ? null : l.platform_color} title={l.child_sku}>{l.child_sku}</SkuTag>
                    {l.product_id && <p className="mt-1 truncate font-mono text-[11.5px] text-ink-3" title={primary?.field_label ?? "Product ID"}>{primary?.field_label ?? "ID"} {l.product_id}</p>}
                  </td>
                  <td className={cn("min-w-[190px]", showAge ? "max-w-[270px]" : "max-w-[370px]")}>
                    <p className="line-clamp-2" title={l.listing_name ?? undefined}>{l.listing_name || <span className="text-ink-3">—</span>}</p>
                    {l.is_deleted && <p className="mt-0.5 text-[11.5px] font-medium text-unmapped">Deleted</p>}
                  </td>
                  <td className="min-w-[180px] max-w-[250px]">
                    <MappingBadge status={l.mapping_status} confidence={l.mapping_confidence} />
                    {!hideMaster && l.master_sku && (
                      <div className="mt-1.5"><MasterTag id={l.master_product_id} sku={l.master_sku} /><p className="mt-0.5 truncate text-[12px] text-ink-3" title={l.master_name ?? undefined}>{l.master_name}</p></div>
                    )}
                    {!l.master_sku && l.suggested_master_sku && (
                      <div className="mt-1.5">
                        <p className="whitespace-nowrap text-[11.5px] text-ink-3">Suggested <span className="rounded-[3px] border border-dashed border-canopy-700 px-1.5 py-px font-mono text-[12px] text-canopy-800">{l.suggested_master_sku}</span></p>
                        <p className="mt-1 line-clamp-2 text-[11.5px] text-ink-3" title={l.match_reason ?? undefined}>{l.match_reason}</p>
                      </div>
                    )}
                    {l.mapping_status === "REMAPPING_REQUIRED" && l.remap_reason && <p className="mt-1 text-[11.5px] text-ink-3">{l.remap_reason === "MASTER_DELETED" ? "Master SKU was deleted" : l.remap_reason}</p>}
                  </td>
                  {!showAge && <td><StatusBadge status={l.listing_status} /></td>}
                  {showAge && (
                    <td className="whitespace-nowrap">
                      <span className="text-ink-2">{fmtDate(l.created_at)}</span>
                      <p className={cn("tnum mt-0.5 text-[12px]", l.days_pending > 30 ? "font-medium text-unmapped" : l.days_pending > 7 ? "text-review" : "text-ink-3")}>{l.days_pending === 0 ? "Today" : `${l.days_pending} day${l.days_pending === 1 ? "" : "s"} pending`}</p>
                    </td>
                  )}
                  <td>
                    <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
                      {busyId === l.id ? <Spinner label="" /> : !l.is_deleted && canMap && (
                        l.mapping_status === "UNMAPPED" ? <Button size="sm" variant="primary" onClick={() => setMapping(l)}>Map</Button>
                        : l.mapping_status === "NEEDS_REVIEW" ? <>
                            <Button size="sm" variant="primary" onClick={() => act(l, "/accept", `${l.child_sku} mapped to ${l.suggested_master_sku}`)}>Accept</Button>
                            <Button size="sm" onClick={() => setMapping(l)}>Choose another</Button>
                          </>
                        : l.mapping_status === "REMAPPING_REQUIRED" ? <Button size="sm" variant="primary" onClick={() => setMapping(l)}>Re-map</Button>
                        : null
                      )}
                      {!showAge && l.open_url && <a href={l.open_url} target="_blank" rel="noopener noreferrer" title="Open listing on the platform" aria-label="Open listing" className="inline-flex size-7 items-center justify-center rounded-md text-ink-3 hover:bg-white hover:text-canopy-700"><ExternalLink className="size-3.5" /></a>}
                      <Menu items={[
                        { label: "Open listing on the platform", onClick: () => {}, href: l.open_url ?? undefined, hidden: !showAge || !l.open_url },
                        { label: "Change Master SKU", onClick: () => setMapping(l), hidden: !canMap || l.is_deleted || l.mapping_status !== "MAPPED" },
                        { label: "Flag for re-mapping", onClick: () => act(l, "/request-remap", "Flagged for re-mapping", "POST", { note: "Flagged as wrongly mapped" }), hidden: !canMap || l.is_deleted || l.mapping_status !== "MAPPED" },
                        { label: "Reject suggestion", onClick: () => act(l, "/reject", "Suggestion rejected; listing is now Unmapped"), hidden: !canMap || l.is_deleted || l.mapping_status !== "NEEDS_REVIEW" },
                        { label: "Remove mapping", onClick: () => act(l, "/unmap", "Mapping removed"), hidden: !canMap || l.is_deleted || !l.master_product_id },
                        { label: "Edit listing", onClick: () => setEditing(l), hidden: !can("listing.write") || l.is_deleted },
                        { label: "Mapping history", onClick: () => setHistory(l) },
                        { label: "Delete listing", danger: true, hidden: !can("listing.delete") || l.is_deleted, onClick: async () => { if (await fb.confirm({ title: `Delete ${l.child_sku}?`, body: `The listing is hidden from every list and report but kept in the database (${MAPPING_LABEL[l.mapping_status]}). You can restore it from All Listings → Deleted.`, confirmLabel: "Delete listing", danger: true })) act(l, "", "Listing deleted", "DELETE"); } },
                        { label: "Restore listing", hidden: !can("listing.delete") || !l.is_deleted, onClick: () => act(l, "/restore", "Listing restored") },
                      ]}><MoreHorizontal className="size-4" /></Menu>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {mapping && <MapDialog listing={mapping} platforms={platforms} onClose={() => setMapping(null)} onDone={() => { setMapping(null); onChanged(); }} />}
      {editing && <ListingFormModal listing={editing} platforms={platforms} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); onChanged(); }} />}
      {history && <HistoryDialog listing={history} onClose={() => setHistory(null)} />}
    </>
  );
}
