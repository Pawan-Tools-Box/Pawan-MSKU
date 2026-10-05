"use client";
import { Check, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { apiFetch, useApi } from "./api";
import { MasterFormModal } from "./MasterFormModal";
import { MasterPicker, type MasterOption } from "./MasterPicker";
import type { PlatformFull } from "./platforms";
import { useSession } from "./session";
import { Button, Checkbox, cn, ConfidenceBar, ErrorNote, MappingBadge, MasterTag, Modal, Note, PlatformName, SkuTag, Spinner, useFeedback } from "./ui";
import type { ListingRow } from "@/server/listings";
import type { MatchSuggestion } from "@/server/matching";

/**
 * Map to Master SKU / Change Master SKU. Shows the listing, the system's suggestions with their
 * confidence and reasons, and a search. Confirming updates the existing listing record.
 */
export function MapDialog({ listing, platforms, onClose, onDone }: {
  listing: ListingRow;
  platforms: PlatformFull[];
  onClose: () => void;
  onDone: () => void;
}) {
  const fb = useFeedback();
  const { can, refreshCounts } = useSession();
  const isChange = listing.master_product_id !== null;
  const sug = useApi<{ suggestions: MatchSuggestion[] }>(`/api/listings/${listing.id}/suggestions`);
  const [selected, setSelected] = useState<MasterOption | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [related, setRelated] = useState<ListingRow[] | null>(null);
  const [relPicked, setRelPicked] = useState<Set<number>>(new Set());
  const [mappedTo, setMappedTo] = useState<MasterOption | null>(null);
  const fields = platforms.find((p) => p.id === listing.platform_id)?.fields ?? [];
  // Very weak name overlaps (generic words such as "office chair") are noise, not suggestions.
  const suggestions = (sug.data?.suggestions ?? []).filter((s) => s.masterId !== listing.master_product_id && s.confidence >= 40);

  useEffect(() => {
    // Pre-select the stored suggestion for listings waiting in Needs Review.
    if (!selected && listing.suggested_master_id && listing.suggested_master_sku) {
      setSelected({ id: listing.suggested_master_id, master_sku: listing.suggested_master_sku, product_name: listing.suggested_master_name ?? "" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const afterMapped = async (m: MasterOption) => {
    refreshCounts();
    try {
      const r = await apiFetch<{ related: ListingRow[] }>(`/api/listings/${listing.id}/related`);
      if (r.related.length) {
        setMappedTo(m);
        setRelated(r.related);
        setRelPicked(new Set(r.related.map((x) => x.id)));
        return;
      }
    } catch { /* related listings are a convenience; mapping already succeeded */ }
    onDone();
  };

  const confirm = async () => {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/listings/${listing.id}/map`, { body: { masterId: selected.id, note: note || undefined } });
      fb.success(`${listing.child_sku} ${isChange ? "moved" : "mapped"} to ${selected.master_sku}`);
      await afterMapped(selected);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  const mapRelated = async () => {
    if (!mappedTo) return;
    setBusy(true);
    try {
      const r = await apiFetch<{ updated: number }>("/api/mapping/bulk", { body: { items: [...relPicked].map((id) => ({ listingId: id, masterId: mappedTo.id })) } });
      fb.success(`${r.updated} more listing${r.updated === 1 ? "" : "s"} mapped to ${mappedTo.master_sku}`);
      refreshCounts();
      onDone();
    } catch (e) { setError((e as Error).message); setBusy(false); }
  };

  if (creating) {
    return <MasterFormModal fromListings={[listing]} onClose={() => setCreating(false)} onSaved={(id, sku) => { setCreating(false); afterMapped({ id, master_sku: sku, product_name: "" }); }} />;
  }

  if (related && mappedTo) {
    return (
      <Modal
        title="Same product on other listings?" onClose={onDone} size="lg"
        subtitle={<>These unmapped listings share the SKU or Product ID you just mapped to <MasterTag sku={mappedTo.master_sku} />.</>}
        footer={<><Button onClick={onDone}>Skip</Button><Button variant="primary" loading={busy} disabled={!relPicked.size} onClick={mapRelated}>Map {relPicked.size} selected to {mappedTo.master_sku}</Button></>}
      >
        {error && <ErrorNote className="mb-3">{error}</ErrorNote>}
        <ul className="divide-y divide-line-2 rounded-md border border-line">
          {related.map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-3 py-2">
              <Checkbox checked={relPicked.has(r.id)} onChange={(e) => setRelPicked((s) => { const n = new Set(s); if (e.target.checked) n.add(r.id); else n.delete(r.id); return n; })} aria-label={`Select ${r.child_sku}`} />
              <PlatformName name={r.platform_name} color={r.platform_color} logo={r.platform_logo} />
              <SkuTag>{r.child_sku}</SkuTag>
              <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-3">{r.listing_name}</span>
            </li>
          ))}
        </ul>
      </Modal>
    );
  }

  return (
    <Modal
      size="lg" onClose={onClose}
      title={isChange ? "Change Master SKU" : "Map to Master SKU"}
      footer={<>
        {can("master.write") && !isChange && <Button className="mr-auto" icon={<Plus className="size-3.5" />} onClick={() => setCreating(true)}>New Master SKU from this listing</Button>}
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" loading={busy} disabled={!selected} onClick={confirm}>{isChange ? "Confirm change" : "Confirm mapping"}</Button>
      </>}
    >
      <div className="space-y-4">
        {error && <ErrorNote>{error}</ErrorNote>}
        <div className="rounded-md border border-line bg-[#fafbf9] p-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <PlatformName name={listing.platform_name} color={listing.platform_color} logo={listing.platform_logo} />
            <SkuTag color={listing.platform_color}>{listing.child_sku}</SkuTag>
            <MappingBadge status={listing.mapping_status} confidence={listing.mapping_confidence} />
          </div>
          <p className="mt-2 text-[13.5px]">{listing.listing_name || <span className="text-ink-3">No listing name</span>}</p>
          <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[12.5px]">
            {listing.product_id && !fields.some((x) => x.is_primary_identifier) && <div><dt className="inline text-ink-3">Product ID </dt><dd className="inline font-mono">{listing.product_id}</dd></div>}
            {listing.listing_id && <div><dt className="inline text-ink-3">Listing ID </dt><dd className="inline font-mono">{listing.listing_id}</dd></div>}
            {fields.filter((x) => listing.custom[String(x.id)] && (x.is_primary_identifier || x.use_for_matching || x.searchable)).map((x) => (
              <div key={x.id}><dt className="inline text-ink-3">{x.field_label} </dt><dd className="inline font-mono">{listing.custom[String(x.id)]}</dd></div>
            ))}
          </dl>
          {isChange && <p className="mt-2 text-[12.5px] text-ink-2">Current Master SKU <MasterTag sku={listing.master_sku!} /> {listing.master_name}</p>}
        </div>

        <div>
          <p className="mb-1.5 text-[12.5px] font-medium text-ink-2">Suggested Master SKUs</p>
          {sug.loading ? <Spinner label="Looking for matches…" /> : suggestions.length === 0 ? (
            <p className="rounded-md border border-dashed border-line px-3 py-3 text-[13px] text-ink-3">No likely match found. Search below{can("master.write") && !isChange ? ", or create a new Master SKU from this listing" : ""}.</p>
          ) : (
            <ul className="divide-y divide-line-2 rounded-md border border-line">
              {suggestions.map((s) => {
                const on = selected?.id === s.masterId;
                return (
                  <li key={s.masterId}>
                    <button type="button" onClick={() => setSelected({ id: s.masterId, master_sku: s.masterSku, product_name: s.productName })} className={cn("flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-canopy-50", on && "bg-canopy-50")}>
                      <span className={cn("flex size-4 shrink-0 items-center justify-center rounded-full border", on ? "border-canopy-700 bg-canopy-700 text-white" : "border-line")}>{on && <Check className="size-3" />}</span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2"><MasterTag sku={s.masterSku} /><span className="truncate text-[13px]">{s.productName}</span></span>
                        <span className="mt-0.5 block text-[12px] text-ink-3">{s.reason}</span>
                      </span>
                      <ConfidenceBar value={s.confidence} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div>
          <p className="mb-1.5 text-[12.5px] font-medium text-ink-2">{suggestions.length ? "Or choose another Master SKU" : "Search Master SKU"}</p>
          <MasterPicker value={selected} onChange={setSelected} />
        </div>
        {isChange && (
          <div>
            <p className="mb-1.5 text-[12.5px] font-medium text-ink-2">Reason for the change (kept in the audit log)</p>
            <input value={note} onChange={(e) => setNote(e.target.value)} className="h-9 w-full rounded-md border border-line px-2.5 text-[13.5px] focus:border-canopy-600 focus:outline-none focus:ring-2 focus:ring-canopy-100" placeholder="Optional" />
          </div>
        )}
        {selected && !isChange && <Note>The existing listing record is updated to <strong>Mapped</strong>. No new record is created.</Note>}
      </div>
    </Modal>
  );
}
