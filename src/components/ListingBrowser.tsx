"use client";
import { useSearchParams } from "next/navigation";
import { CheckCheck, Download, Plus, RefreshCw } from "lucide-react";
import { useState, type ReactNode } from "react";
import { apiFetch, fmtNum, qs, useApi, useDebounced } from "./api";
import { ListingFormModal } from "./ListingFormModal";
import { ListingsTable } from "./ListingsTable";
import { MasterFormModal } from "./MasterFormModal";
import { MasterPicker, type MasterOption } from "./MasterPicker";
import { usePlatforms } from "./platforms";
import { useSession } from "./session";
import { Button, Checkbox, Empty, ErrorNote, Input, LinkButton, Modal, Note, PageHeader, Pagination, Panel, Select, SkuTag, Spinner, useFeedback } from "./ui";
import type { ListingRow } from "@/server/listings";
import type { Paged } from "@/server/types";

export interface ListingBrowserProps {
  title: string;
  description: ReactNode;
  /** Which queue this screen shows. "all" lets the user filter by any mapping status. */
  mode: "all" | "unmapped" | "review";
  exportReport: string;
  emptyTitle: string;
  emptyBody: ReactNode;
}

const STATUS_SETS: Record<string, string> = {
  pending: "UNMAPPED,REMAPPING_REQUIRED",
  UNMAPPED: "UNMAPPED",
  NEEDS_REVIEW: "NEEDS_REVIEW",
  REMAPPING_REQUIRED: "REMAPPING_REQUIRED",
  MAPPED: "MAPPED",
};

export function ListingBrowser({ title, description, mode, exportReport, emptyTitle, emptyBody }: ListingBrowserProps) {
  const sp = useSearchParams();
  const fb = useFeedback();
  const { can, refreshCounts } = useSession();
  const { platforms } = usePlatforms();
  const [q, setQ] = useState(sp.get("q") ?? "");
  const [platformId, setPlatformId] = useState(sp.get("platformId") ?? "");
  const [status, setStatus] = useState(mode === "unmapped" ? "pending" : mode === "review" ? "NEEDS_REVIEW" : sp.get("mappingStatus") ?? "");
  const [listingStatus, setListingStatus] = useState(sp.get("inactive") ? "NOT_ACTIVE" : "");
  const [age, setAge] = useState("");
  const [deleted, setDeleted] = useState(sp.get("deleted") === "only");
  const [page, setPage] = useState(1);
  const [sortChoice, setSortChoice] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [picked, setPicked] = useState<Map<number, ListingRow>>(new Map());
  const [bulk, setBulk] = useState<"map" | "create" | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const dq = useDebounced(q);
  const reset = () => { setPage(1); };

  const path = `/api/listings${qs({
    q: dq, platformId, mappingStatus: STATUS_SETS[status] ?? "", listingStatus: listingStatus === "NOT_ACTIVE" ? "" : listingStatus,
    inactive: listingStatus === "NOT_ACTIVE", age, deleted: deleted ? "only" : "", page, pageSize: 50,
    sort: sortChoice ? sortChoice.split("|")[0] : mode === "review" ? "confidence" : "created",
    dir: sortChoice ? sortChoice.split("|")[1] : mode === "unmapped" ? "asc" : "desc",
  })}`;
  // Custom fields the admin marked "sortable" become sort options once a platform is chosen.
  const sortableFields = platforms.find((p) => String(p.id) === platformId)?.fields.filter((f) => f.sortable) ?? [];
  const { data, loading, error, reload } = useApi<Paged<ListingRow>>(path);

  const onSelect = (next: Set<number>) => {
    setSelected(next);
    setPicked((prev) => {
      const m = new Map(prev);
      for (const r of data?.rows ?? []) { if (next.has(r.id)) m.set(r.id, r); else m.delete(r.id); }
      return m;
    });
  };
  const clear = () => { setSelected(new Set()); setPicked(new Map()); };
  const changed = () => { reload(); refreshCounts(); };
  const selectedRows = [...picked.values()];

  const rematch = async () => {
    setBusy(true);
    try {
      const r = await apiFetch<{ checked: number; mapped: number; review: number }>("/api/mapping/rematch", { body: { platformId: platformId ? Number(platformId) : undefined } });
      fb.success(`Checked ${fmtNum(r.checked)} listings: ${fmtNum(r.mapped)} mapped, ${fmtNum(r.review)} need review`);
      changed();
    } catch (e) { fb.error((e as Error).message); }
    finally { setBusy(false); }
  };

  const acceptSelected = async () => {
    const items = selectedRows.filter((r) => r.suggested_master_id).map((r) => ({ listingId: r.id, masterId: r.suggested_master_id }));
    if (!items.length) { fb.error("None of the selected listings has a suggestion."); return; }
    setBusy(true);
    try {
      const r = await apiFetch<{ updated: number }>("/api/mapping/bulk", { body: { items } });
      fb.success(`${r.updated} suggestion${r.updated === 1 ? "" : "s"} accepted`);
      clear(); changed();
    } catch (e) { fb.error((e as Error).message); }
    finally { setBusy(false); }
  };

  const filtered = !!(dq || platformId || age || listingStatus || (mode === "all" && status) || deleted);

  return (
    <>
      <PageHeader
        title={title} description={description}
        actions={<>
          {can("export.run") && <LinkButton href={`/api/reports/${exportReport}${qs({ format: "xlsx", platformId })}`} icon={<Download className="size-3.5" />}>Export</LinkButton>}
          {mode !== "all" && can("mapping.write") && <Button loading={busy} onClick={rematch} icon={<RefreshCw className="size-3.5" />} title="Run automatic matching again over everything still pending">Re-run auto-match</Button>}
          {mode === "all" && can("listing.write") && <Button variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setAdding(true)}>Add listing</Button>}
        </>}
      />
      <Panel pad={false}>
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <Input value={q} onChange={(e) => { setQ(e.target.value); reset(); }} placeholder="Search Child SKU, listing name, Product ID, ASIN, FSN…" className="w-full sm:w-[320px]" aria-label="Search listings" />
          <Select value={platformId} onChange={(e) => { setPlatformId(e.target.value); if (sortChoice.startsWith("cf:")) setSortChoice(""); reset(); }} className="w-auto" aria-label="Platform">
            <option value="">All platforms</option>{platforms.map((p) => <option key={p.id} value={p.id}>{p.platform_name}</option>)}
          </Select>
          {mode !== "review" && (
            <Select value={status} onChange={(e) => { setStatus(e.target.value); reset(); }} className="w-auto" aria-label="Mapping status">
              {mode === "all" ? <option value="">Any mapping status</option> : <option value="pending">Unmapped and re-mapping required</option>}
              {mode === "all" && <option value="MAPPED">Mapped</option>}
              <option value="UNMAPPED">Unmapped</option><option value="NEEDS_REVIEW">Needs review</option><option value="REMAPPING_REQUIRED">Re-mapping required</option>
            </Select>
          )}
          {mode !== "all" ? (
            <Select value={age} onChange={(e) => { setAge(e.target.value); reset(); }} className="w-auto" aria-label="Age">
              <option value="">Any age</option><option value="today">Today</option><option value="1-7">1–7 days</option><option value="8-30">8–30 days</option><option value="30+">30+ days</option>
            </Select>
          ) : (
            <Select value={listingStatus} onChange={(e) => { setListingStatus(e.target.value); reset(); }} className="w-auto" aria-label="Listing status">
              <option value="">Any listing status</option><option value="ACTIVE">Active</option><option value="NOT_ACTIVE">Not active (any)</option><option value="INACTIVE">Inactive</option>
              <option value="INCOMPLETE">Incomplete</option><option value="ARCHIVED">Archived</option>
            </Select>
          )}
          <Select value={sortChoice} onChange={(e) => { setSortChoice(e.target.value); reset(); }} className="w-auto" aria-label="Sort by">
            <option value="">{mode === "review" ? "Highest confidence first" : mode === "unmapped" ? "Oldest first" : "Newest first"}</option>
            <option value="child_sku|asc">Child SKU A to Z</option><option value="listing_name|asc">Listing name A to Z</option>
            {mode !== "unmapped" && <option value="created|asc">Oldest first</option>}
            {mode !== "all" && <option value="created|desc">Newest first</option>}
            {sortableFields.map((f) => <option key={f.id} value={`cf:${f.id}|asc`}>{f.field_label} ascending</option>)}
            {sortableFields.map((f) => <option key={`d${f.id}`} value={`cf:${f.id}|desc`}>{f.field_label} descending</option>)}
          </Select>
          {mode === "all" && can("listing.delete") && <span className="ml-auto"><Checkbox label="Deleted" checked={deleted} onChange={(e) => { setDeleted(e.target.checked); reset(); }} /></span>}
        </div>

        {selected.size > 0 && can("mapping.write") && (
          <div className="flex flex-wrap items-center gap-2 border-b border-line bg-canopy-50 px-3 py-2 text-[13px]">
            <span className="font-medium">{selected.size} selected</span>
            {mode === "review" && <Button size="sm" variant="primary" loading={busy} icon={<CheckCheck className="size-3.5" />} onClick={acceptSelected}>Accept suggestions</Button>}
            <Button size="sm" variant={mode === "review" ? "secondary" : "primary"} onClick={() => setBulk("map")}>Map to one Master SKU</Button>
            {can("master.write") && <Button size="sm" onClick={() => setBulk("create")}>Create Master SKU from selection</Button>}
            <Button size="sm" variant="ghost" onClick={clear}>Clear</Button>
          </div>
        )}

        {error ? <div className="p-4"><ErrorNote>{error}</ErrorNote></div> : loading && !data ? <Spinner /> : data && data.rows.length === 0 ? (
          <Empty title={filtered ? "No listing matches these filters" : emptyTitle}>{filtered ? "Clear a filter or shorten the search." : emptyBody}</Empty>
        ) : data && (
          <>
            <ListingsTable rows={data.rows} platforms={platforms} onChanged={changed} selectable={can("mapping.write") && !deleted} selected={selected} onSelect={onSelect} showAge={mode !== "all"} />
            <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
          </>
        )}
      </Panel>

      {bulk === "map" && <BulkMapModal rows={selectedRows} onClose={() => setBulk(null)} onDone={() => { setBulk(null); clear(); changed(); }} />}
      {bulk === "create" && <MasterFormModal fromListings={selectedRows} onClose={() => setBulk(null)} onSaved={() => { setBulk(null); clear(); changed(); }} />}
      {adding && <ListingFormModal platforms={platforms} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); changed(); }} />}
    </>
  );
}

function BulkMapModal({ rows, onClose, onDone }: { rows: ListingRow[]; onClose: () => void; onDone: () => void }) {
  const fb = useFeedback();
  const [master, setMaster] = useState<MasterOption | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    if (!master) return;
    setBusy(true); setError(null);
    try {
      const r = await apiFetch<{ ok: boolean; updated: number; errors: { message: string }[] }>("/api/mapping/bulk", { body: { items: rows.map((l) => ({ listingId: l.id, masterId: master.id })) } });
      if (!r.ok) { setError(r.errors[0]?.message ?? "Some rows could not be mapped."); return; }
      fb.success(`${r.updated} listing${r.updated === 1 ? "" : "s"} mapped to ${master.master_sku}`);
      onDone();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  return (
    <Modal title={`Map ${rows.length} listing${rows.length === 1 ? "" : "s"} to one Master SKU`} onClose={onClose} size="lg"
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} disabled={!master} onClick={save}>Save all mappings</Button></>}>
      <div className="space-y-4">
        {error && <ErrorNote>{error}</ErrorNote>}
        <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto rounded-md border border-line bg-[#fafbf9] p-2.5">
          {rows.map((l) => <SkuTag key={l.id} color={l.platform_color} title={`${l.platform_name}: ${l.listing_name ?? ""}`}>{l.child_sku}</SkuTag>)}
        </div>
        <MasterPicker value={master} onChange={setMaster} autoFocus />
        <Note>Use this when every selected listing is the same product. To give each listing a different Master SKU, use SKU Mapping → Bulk mapping.</Note>
      </div>
    </Modal>
  );
}
