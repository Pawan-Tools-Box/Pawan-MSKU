"use client";
import { ImagePlus } from "lucide-react";
import { useRef, useState } from "react";
import { apiFetch } from "./api";
import { Button, Field, Input, PlatformMark, Select, Textarea, useFeedback } from "./ui";

export interface PlatformFormState {
  platform_name: string; platform_code: string; platform_type: string; website_url: string; logo: string; brand_color: string;
  description: string; listing_url_template: string; status: string;
}

export const EMPTY_PLATFORM: PlatformFormState = {
  platform_name: "", platform_code: "", platform_type: "Marketplace", website_url: "", logo: "", brand_color: "#2D735D",
  description: "", listing_url_template: "", status: "ACTIVE",
};

export function codeFromName(name: string) {
  return name.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 30);
}

/** Platform profile fields, shared by "Add platform" and the platform's edit screen. */
export function PlatformFields({ value, onChange, types, isNew }: { value: PlatformFormState; onChange: (v: PlatformFormState) => void; types: string[]; isNew?: boolean }) {
  const fb = useFeedback();
  const file = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [codeTouched, setCodeTouched] = useState(!isNew);
  const set = (k: keyof PlatformFormState, v: string) => onChange({ ...value, [k]: v });
  const upload = async (f: File | undefined) => {
    if (!f) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.set("file", f);
      const r = await apiFetch<{ url: string }>("/api/media", { form });
      set("logo", r.url);
    } catch (e) { fb.error((e as Error).message); }
    finally { setUploading(false); }
  };
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Platform name" required>
        <Input value={value.platform_name} placeholder="Meesho" onChange={(e) => onChange({ ...value, platform_name: e.target.value, platform_code: codeTouched ? value.platform_code : codeFromName(e.target.value) })} />
      </Field>
      <Field label="Platform code" required hint="Short unique code used in exports and Excel mapping.">
        <Input value={value.platform_code} placeholder="MEESHO" className="font-mono" onChange={(e) => { setCodeTouched(true); set("platform_code", e.target.value.toUpperCase()); }} />
      </Field>
      <Field label="Platform type">
        <Select value={value.platform_type} onChange={(e) => set("platform_type", e.target.value)}>
          {[...new Set([...types, value.platform_type])].filter(Boolean).map((t) => <option key={t}>{t}</option>)}
        </Select>
      </Field>
      <Field label="Status">
        <Select value={value.status} onChange={(e) => set("status", e.target.value)}>
          <option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option>{!isNew && <option value="ARCHIVED">Archived</option>}
        </Select>
      </Field>
      <Field label="Platform website"><Input type="url" value={value.website_url} placeholder="https://www.meesho.com" onChange={(e) => set("website_url", e.target.value)} /></Field>
      <Field label="Logo and colour" hint="Used on cards, tables and coverage. PNG, JPG or WebP up to 3 MB.">
        <div className="flex items-center gap-2">
          <PlatformMark name={value.platform_name || "?"} color={value.brand_color} logo={value.logo || null} size={36} />
          <input ref={file} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(e) => upload(e.target.files?.[0])} />
          <Button loading={uploading} icon={<ImagePlus className="size-3.5" />} onClick={() => file.current?.click()}>{value.logo ? "Replace logo" : "Upload logo"}</Button>
          {value.logo && <Button variant="ghost" onClick={() => set("logo", "")}>Remove</Button>}
          <input type="color" aria-label="Platform colour" value={value.brand_color || "#2D735D"} onChange={(e) => set("brand_color", e.target.value)} className="h-9 w-10 cursor-pointer rounded-md border border-line bg-white p-1" />
        </div>
      </Field>
      <Field label="Listing link pattern" className="sm:col-span-2" hint={<>Optional. Builds the “Open listing” link when a listing has no URL of its own. Use <code className="font-mono">{"{product_id}"}</code>, <code className="font-mono">{"{listing_id}"}</code> or <code className="font-mono">{"{child_sku}"}</code>.</>}>
        <Input value={value.listing_url_template} placeholder="https://www.example.com/product/{product_id}" className="font-mono text-[12.5px]" onChange={(e) => set("listing_url_template", e.target.value)} />
      </Field>
      <Field label="Description" className="sm:col-span-2"><Textarea value={value.description} onChange={(e) => set("description", e.target.value)} /></Field>
    </div>
  );
}
