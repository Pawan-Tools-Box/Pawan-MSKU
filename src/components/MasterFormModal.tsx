"use client";
import { ImagePlus, Sparkles, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { apiFetch } from "./api";
import { Button, ErrorNote, Field, Input, Modal, Note, Select, SkuTag, Textarea, useFeedback } from "./ui";
import type { ListingRow } from "@/server/listings";
import type { MasterInput } from "@/server/masters";

type Form = Required<Pick<MasterInput, "master_sku" | "product_name">> & Record<string, string>;

const EMPTY: Form = {
  master_sku: "", product_name: "", model: "", category: "", brand: "", product_type: "", color: "", material: "", size: "", variant: "",
  internal_code: "", image: "", status: "ACTIVE", remarks: "",
};

/**
 * Create or edit a Master SKU. With `fromListings`, the new Master SKU is created and those
 * listings are mapped to it in the same step (used from Unmapped SKUs).
 */
export function MasterFormModal({ master, images, fromListings, defaultBrand, onClose, onSaved }: {
  master?: Record<string, unknown> & { id: number };
  images?: string[];
  fromListings?: ListingRow[];
  defaultBrand?: string;
  onClose: () => void;
  onSaved: (id: number, masterSku: string) => void;
}) {
  const fb = useFeedback();
  const first = fromListings?.[0];
  const [f, setF] = useState<Form>(() => {
    if (master) return { ...EMPTY, ...Object.fromEntries(Object.keys(EMPTY).map((k) => [k, (master[k] as string) ?? ""])) } as Form;
    return { ...EMPTY, brand: defaultBrand ?? "", product_name: first?.listing_name?.slice(0, 120) ?? "", color: first?.color ?? "" };
  });
  const [extra, setExtra] = useState<string[]>(images ?? []);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileMain = useRef<HTMLInputElement>(null);
  const fileExtra = useRef<HTMLInputElement>(null);
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  const suggest = async () => {
    const basis = f.model || f.product_name;
    if (!basis.trim()) { setError("Enter the model or product name first, then ask for a suggestion."); return; }
    const r = await apiFetch<{ masterSku: string }>(`/api/masters/suggest-sku?model=${encodeURIComponent(f.model || f.product_name.split(/\s+/).slice(0, 2).join(" "))}`);
    set("master_sku", r.masterSku);
  };

  const upload = async (file: File | undefined, target: "main" | "extra") => {
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.set("file", file);
      const r = await apiFetch<{ url: string }>("/api/media", { form });
      if (target === "main") set("image", r.url); else setExtra((x) => [...x, r.url]);
    } catch (e) { fb.error((e as Error).message); }
    finally { setUploading(false); }
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const payload = { ...f, images: extra };
      if (master) {
        await apiFetch(`/api/masters/${master.id}`, { method: "PATCH", body: payload });
        fb.success("Master SKU saved");
        onSaved(master.id, f.master_sku);
      } else if (fromListings?.length) {
        const r = await apiFetch<{ id: number; master_sku: string; mapped: number }>("/api/masters/from-listings", { body: { master: payload, listingIds: fromListings.map((l) => l.id) } });
        fb.success(`${r.master_sku} created and ${r.mapped} listing${r.mapped === 1 ? "" : "s"} mapped to it`);
        onSaved(r.id, r.master_sku);
      } else {
        const r = await apiFetch<{ master: { id: number; master_sku: string } }>("/api/masters", { body: payload });
        fb.success(`${r.master.master_sku} created`);
        onSaved(r.master.id, r.master.master_sku);
      }
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <Modal
      size="lg" onClose={onClose}
      title={master ? `Edit ${master.master_sku}` : fromListings?.length ? "Create Master SKU from selected listings" : "Add Master SKU"}
      subtitle={fromListings?.length ? "The new Master SKU is created and the listings below are mapped to it." : "The permanent internal code for one real product."}
      footer={<>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" loading={busy} onClick={save}>{master ? "Save changes" : fromListings?.length ? "Create and map" : "Create Master SKU"}</Button>
      </>}
    >
      <div className="space-y-4">
        {error && <ErrorNote>{error}</ErrorNote>}
        {fromListings && fromListings.length > 0 && (
          <Note>
            <p className="mb-1.5 font-medium">{fromListings.length} listing{fromListings.length === 1 ? "" : "s"} will be mapped</p>
            <div className="flex flex-wrap gap-1.5">
              {fromListings.slice(0, 12).map((l) => <SkuTag key={l.id} color={l.platform_color} title={`${l.platform_name}: ${l.listing_name ?? ""}`}>{l.child_sku}</SkuTag>)}
              {fromListings.length > 12 && <span className="text-[12px]">and {fromListings.length - 12} more</span>}
            </div>
          </Note>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Master SKU" required hint="Letters, numbers and dashes. Stored in capitals.">
            <div className="flex gap-2">
              <Input value={f.master_sku} onChange={(e) => set("master_sku", e.target.value.toUpperCase())} placeholder="OC-MATRIX-001" className="font-mono" />
              {!master && <Button onClick={suggest} icon={<Sparkles className="size-3.5" />} title="Suggest the next free code for this model">Suggest</Button>}
            </div>
          </Field>
          <Field label="Product name" required><Input value={f.product_name} onChange={(e) => set("product_name", e.target.value)} placeholder="Matrix Ergonomic Office Chair" /></Field>
          <Field label="Product model" hint="Used for automatic matching. Keep it short, e.g. Matrix."><Input value={f.model} onChange={(e) => set("model", e.target.value)} /></Field>
          <Field label="Category"><Input value={f.category} onChange={(e) => set("category", e.target.value)} placeholder="Office Chair" /></Field>
          <Field label="Brand"><Input value={f.brand} onChange={(e) => set("brand", e.target.value)} /></Field>
          <Field label="Product type"><Input value={f.product_type} onChange={(e) => set("product_type", e.target.value)} /></Field>
          <Field label="Color" hint="Also used for matching."><Input value={f.color} onChange={(e) => set("color", e.target.value)} /></Field>
          <Field label="Material"><Input value={f.material} onChange={(e) => set("material", e.target.value)} /></Field>
          <Field label="Size"><Input value={f.size} onChange={(e) => set("size", e.target.value)} /></Field>
          <Field label="Variant"><Input value={f.variant} onChange={(e) => set("variant", e.target.value)} /></Field>
          <Field label="Internal product code"><Input value={f.internal_code} onChange={(e) => set("internal_code", e.target.value)} className="font-mono" /></Field>
          <Field label="Status">
            <Select value={f.status} onChange={(e) => set("status", e.target.value)}>
              <option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option><option value="DISCONTINUED">Discontinued</option>
            </Select>
          </Field>
        </div>
        <Field label="Main product image" hint="Upload a PNG, JPG or WebP up to 3 MB, or paste an image link.">
          <div className="flex items-center gap-3">
            {f.image
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={f.image} alt="" className="size-14 rounded-md border border-line object-cover" />
              : <span className="flex size-14 items-center justify-center rounded-md border border-dashed border-line text-ink-3"><ImagePlus className="size-5" /></span>}
            <Input value={f.image} onChange={(e) => set("image", e.target.value)} placeholder="https://…" className="flex-1" />
            <input ref={fileMain} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(e) => upload(e.target.files?.[0], "main")} />
            <Button loading={uploading} onClick={() => fileMain.current?.click()}>Upload</Button>
          </div>
        </Field>
        <div>
          <p className="mb-1 text-[12.5px] font-medium text-ink-2">Additional images</p>
          <div className="flex flex-wrap items-center gap-2">
            {extra.map((src, i) => (
              <span key={src + i} className="group relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" className="size-14 rounded-md border border-line object-cover" />
                <button type="button" aria-label="Remove image" onClick={() => setExtra((x) => x.filter((_, j) => j !== i))} className="absolute -right-1.5 -top-1.5 rounded-full border border-line bg-white p-0.5 text-unmapped shadow"><Trash2 className="size-3" /></button>
              </span>
            ))}
            <input ref={fileExtra} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(e) => upload(e.target.files?.[0], "extra")} />
            <button type="button" onClick={() => fileExtra.current?.click()} className="flex size-14 items-center justify-center rounded-md border border-dashed border-line text-ink-3 hover:border-canopy-600 hover:text-canopy-700" aria-label="Add image"><ImagePlus className="size-5" /></button>
          </div>
        </div>
        <Field label="Remarks"><Textarea value={f.remarks} onChange={(e) => set("remarks", e.target.value)} /></Field>
      </div>
    </Modal>
  );
}
