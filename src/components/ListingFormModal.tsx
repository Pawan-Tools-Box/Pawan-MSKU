"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { apiFetch, ApiError } from "./api";
import { MasterPicker, type MasterOption } from "./MasterPicker";
import type { PlatformFull } from "./platforms";
import { Button, ErrorNote, Field, Input, MasterTag, Modal, PlatformName, Select, Textarea, useFeedback } from "./ui";
import type { ListingRow } from "@/server/listings";
import type { PlatformField } from "@/server/types";

const STATUSES = ["ACTIVE", "INACTIVE", "INCOMPLETE", "ARCHIVED", "UNKNOWN"];

function CustomInput({ field, value, onChange }: { field: PlatformField; value: string; onChange: (v: string) => void }) {
  if (field.field_type === "select") {
    return <Select value={value} onChange={(e) => onChange(e.target.value)}><option value="">Select…</option>{(field.options ?? []).map((o) => <option key={o}>{o}</option>)}</Select>;
  }
  if (field.field_type === "boolean") {
    return <Select value={value} onChange={(e) => onChange(e.target.value)}><option value="">Not set</option><option value="true">Yes</option><option value="false">No</option></Select>;
  }
  const type = field.field_type === "number" ? "number" : field.field_type === "date" ? "date" : field.field_type === "url" ? "url" : "text";
  return <Input type={type} step="any" value={value} onChange={(e) => onChange(e.target.value)} className={field.is_primary_identifier || field.use_for_matching ? "font-mono" : undefined} />;
}

/**
 * Add or edit a platform listing. The form is built from the chosen platform's configuration:
 * standard fields first, then whatever custom fields the admin defined for that platform.
 */
export function ListingFormModal({ listing, platforms, fixedPlatformId, fixedMaster, onClose, onSaved }: {
  listing?: ListingRow;
  platforms: PlatformFull[];
  fixedPlatformId?: number;
  fixedMaster?: MasterOption;
  onClose: () => void;
  onSaved: (l: ListingRow) => void;
}) {
  const fb = useFeedback();
  const usable = platforms.filter((p) => p.status !== "ARCHIVED");
  const [platformId, setPlatformId] = useState<number>(listing?.platform_id ?? fixedPlatformId ?? 0);
  const platform = useMemo(() => platforms.find((p) => p.id === platformId), [platforms, platformId]);
  const [f, setF] = useState<Record<string, string>>({
    child_sku: listing?.child_sku ?? "", seller_sku: listing?.seller_sku ?? "", listing_name: listing?.listing_name ?? "",
    product_title: listing?.product_title ?? "", product_id: listing?.product_id ?? "", listing_id: listing?.listing_id ?? "",
    listing_url: listing?.listing_url ?? "", variant: listing?.variant ?? "", color: listing?.color ?? "", size: listing?.size ?? "",
    listing_status: listing?.listing_status ?? "ACTIVE", remarks: listing?.remarks ?? "",
  });
  const [custom, setCustom] = useState<Record<string, string>>(listing?.custom ?? {});
  const [master, setMaster] = useState<MasterOption | null>(fixedMaster ?? null);
  const [error, setError] = useState<ApiError | Error | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));
  const primary = platform?.fields.find((x) => x.is_primary_identifier);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const customPayload = Object.fromEntries((platform?.fields ?? []).map((x) => [String(x.id), custom[String(x.id)] ?? ""]));
      // When the platform has its own identifier field (ASIN, FSN…), Product ID follows it.
      const body: Record<string, unknown> = { ...f, custom: customPayload };
      if (primary) delete body.product_id;
      const r = listing
        ? await apiFetch<{ listing: ListingRow }>(`/api/listings/${listing.id}`, { method: "PATCH", body })
        : await apiFetch<{ listing: ListingRow }>("/api/listings", { body: { ...body, platform_id: platformId, master_product_id: master?.id ?? null } });
      fb.success(listing ? "Listing saved" : r.listing.mapping_status === "MAPPED" ? `Listing added under ${r.listing.master_sku}` : "Listing added to Unmapped SKUs");
      onSaved(r.listing);
    } catch (e) { setError(e as Error); }
    finally { setBusy(false); }
  };

  const requestRemap = async (id: number) => {
    try {
      await apiFetch(`/api/listings/${id}/request-remap`, { body: { note: "Requested while adding a duplicate Child SKU" } });
      fb.success("Existing listing flagged for re-mapping");
      onClose();
    } catch (e) { fb.error((e as Error).message); }
  };

  const dup = error instanceof ApiError && error.status === 409 ? (error.details as { existingListingId?: number; masterId?: number; masterSku?: string; deleted?: boolean } | null) : null;

  return (
    <Modal
      size="lg" onClose={onClose}
      title={listing ? "Edit listing" : "Add platform listing"}
      subtitle={listing ? <PlatformName name={listing.platform_name} color={listing.platform_color} logo={listing.platform_logo} /> : fixedMaster ? <>Will be linked to <MasterTag sku={fixedMaster.master_sku} /></> : undefined}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} disabled={!platformId} onClick={save}>{listing ? "Save changes" : "Save listing"}</Button></>}
    >
      <div className="space-y-4">
        {error && (
          <ErrorNote>
            <p>{error.message}</p>
            {dup?.existingListingId && (
              <div className="mt-2 flex flex-wrap gap-2">
                <Link href={dup.masterId ? `/masters/${dup.masterId}` : `/listings?q=${encodeURIComponent(f.child_sku)}${dup.deleted ? "&deleted=only" : ""}`} className="rounded border border-unmapped/40 bg-white px-2 py-1 text-[12.5px] font-medium">View existing</Link>
                {dup.masterId && <button type="button" onClick={() => requestRemap(dup.existingListingId!)} className="rounded border border-unmapped/40 bg-white px-2 py-1 text-[12.5px] font-medium">Request re-mapping</button>}
              </div>
            )}
          </ErrorNote>
        )}
        {!listing && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Platform" required>
              <Select value={platformId || ""} disabled={!!fixedPlatformId} onChange={(e) => { setPlatformId(Number(e.target.value)); setCustom({}); }}>
                <option value="">Select platform…</option>
                {usable.map((p) => <option key={p.id} value={p.id}>{p.platform_name}{p.status !== "ACTIVE" ? " (inactive)" : ""}</option>)}
              </Select>
            </Field>
            {!fixedMaster && (
              <Field label="Master SKU" hint="Leave empty to let automatic matching decide, or to map later.">
                <MasterPicker value={master} onChange={setMaster} />
              </Field>
            )}
          </div>
        )}
        {platform && (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Child SKU" required hint="Exactly as the marketplace shows it."><Input value={f.child_sku} onChange={(e) => set("child_sku", e.target.value)} className="font-mono" /></Field>
              <Field label="Seller SKU"><Input value={f.seller_sku} onChange={(e) => set("seller_sku", e.target.value)} className="font-mono" /></Field>
              <Field label="Listing name" className="sm:col-span-2"><Input value={f.listing_name} onChange={(e) => set("listing_name", e.target.value)} /></Field>
              <Field label="Product title" className="sm:col-span-2" hint="Only if it differs from the listing name."><Input value={f.product_title} onChange={(e) => set("product_title", e.target.value)} /></Field>
              {!primary && <Field label="Product ID"><Input value={f.product_id} onChange={(e) => set("product_id", e.target.value)} className="font-mono" /></Field>}
              <Field label="Listing ID"><Input value={f.listing_id} onChange={(e) => set("listing_id", e.target.value)} className="font-mono" /></Field>
              <Field label="Status">
                <Select value={f.listing_status} onChange={(e) => set("listing_status", e.target.value)}>
                  {STATUSES.map((s) => <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>)}
                </Select>
              </Field>
              <Field label="Listing URL" className="sm:col-span-2" hint={platform.listing_url_template ? "Leave empty to build the link from the Product ID automatically." : undefined}>
                <Input type="url" value={f.listing_url} onChange={(e) => set("listing_url", e.target.value)} placeholder="https://…" />
              </Field>
              <Field label="Variant"><Input value={f.variant} onChange={(e) => set("variant", e.target.value)} /></Field>
              <Field label="Color"><Input value={f.color} onChange={(e) => set("color", e.target.value)} /></Field>
              <Field label="Size"><Input value={f.size} onChange={(e) => set("size", e.target.value)} /></Field>
            </div>
            {platform.fields.length > 0 && (
              <fieldset className="rounded-md border border-line p-3">
                <legend className="px-1 text-[12.5px] font-medium text-ink-2">{platform.platform_name} fields</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  {platform.fields.map((x) => (
                    <Field key={x.id} label={x.field_label} required={x.required} hint={x.is_primary_identifier ? "Shown as this listing's Product ID." : undefined}>
                      <CustomInput field={x} value={custom[String(x.id)] ?? ""} onChange={(v) => setCustom((c) => ({ ...c, [String(x.id)]: v }))} />
                    </Field>
                  ))}
                </div>
              </fieldset>
            )}
            <Field label="Remarks"><Textarea value={f.remarks} onChange={(e) => set("remarks", e.target.value)} /></Field>
          </>
        )}
      </div>
    </Modal>
  );
}
