"use client";
import { Search, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { apiFetch, useDebounced } from "./api";
import { cn, MasterTag } from "./ui";

export interface MasterOption {
  id: number;
  master_sku: string;
  product_name: string;
  model?: string | null;
  color?: string | null;
  listing_count?: number;
  via?: string | null;
}

/** Type-ahead for Master SKUs. Searches Master SKU, product name, model, and any Child SKU or listing already linked. */
export function MasterPicker({ value, onChange, autoFocus, compact, placeholder }: {
  value: MasterOption | null;
  onChange: (m: MasterOption | null) => void;
  autoFocus?: boolean;
  compact?: boolean;
  placeholder?: string;
}) {
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<MasterOption[]>([]);
  const [active, setActive] = useState(0);
  const debounced = useDebounced(term, 200);
  const box = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const [rect, setRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    let live = true;
    apiFetch<{ masters: MasterOption[] }>(`/api/masters/search?q=${encodeURIComponent(debounced)}`)
      .then((r) => { if (live) { setResults(r.masters); setActive(0); } })
      .catch(() => {});
    return () => { live = false; };
  }, [debounced, open]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!box.current?.contains(t) && !list.current?.contains(t)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  // The result list is fixed to the viewport so a scrolling table or dialog can never clip it.
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const r = box.current?.getBoundingClientRect();
      if (!r) return;
      const spaceBelow = window.innerHeight - r.bottom;
      const height = Math.min(264, Math.max(140, spaceBelow > 180 ? spaceBelow - 12 : r.top - 12));
      setRect({ left: r.left, width: Math.max(r.width, 320), top: spaceBelow > 180 ? r.bottom + 4 : Math.max(8, r.top - 4 - height), height });
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => { window.removeEventListener("scroll", place, true); window.removeEventListener("resize", place); };
  }, [open, results.length]);

  if (value) {
    return (
      <div className={cn("flex items-center gap-2 rounded-md border border-canopy-600 bg-canopy-50", compact ? "h-8 px-2" : "px-3 py-2")}>
        <MasterTag sku={value.master_sku} />
        <span className="min-w-0 flex-1 truncate text-[13px]">{value.product_name}</span>
        <button type="button" aria-label="Clear selection" onClick={() => onChange(null)} className="rounded p-0.5 text-ink-3 hover:bg-white hover:text-ink"><X className="size-3.5" /></button>
      </div>
    );
  }
  const pick = (m: MasterOption) => { onChange(m); setOpen(false); setTerm(""); };
  return (
    <div ref={box} className="relative">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-3" />
      <input
        autoFocus={autoFocus} value={term} placeholder={placeholder ?? "Search Master SKU, product, model or an existing Child SKU"}
        onChange={(e) => { setTerm(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          else if (e.key === "Enter" && open && results[active]) { e.preventDefault(); pick(results[active]); }
          else if (e.key === "Escape") setOpen(false);
        }}
        role="combobox" aria-expanded={open} aria-controls="master-picker-list" aria-label="Search Master SKU"
        className={cn("w-full rounded-md border border-line bg-white pl-8 pr-2.5 text-[13.5px] placeholder:text-ink-3/70 focus:border-canopy-600 focus:outline-none focus:ring-2 focus:ring-canopy-100", compact ? "h-8" : "h-9")}
      />
      {open && rect && (
        <ul ref={list} id="master-picker-list" role="listbox" className="fixed z-[70] overflow-y-auto rounded-md border border-line bg-white py-1 shadow-xl" style={{ left: rect.left, top: rect.top, width: rect.width, maxHeight: rect.height }}>
          {results.length === 0 && <li className="px-3 py-3 text-[13px] text-ink-3">{term ? "No Master SKU matches. Create one first, or check the spelling." : "Type to search Master SKUs."}</li>}
          {results.map((m, i) => (
            <li key={m.id} role="option" aria-selected={i === active}>
              <button type="button" onMouseEnter={() => setActive(i)} onClick={() => pick(m)} className={cn("flex w-full items-center gap-2 px-3 py-1.5 text-left", i === active && "bg-canopy-50")}>
                <MasterTag sku={m.master_sku} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px]">{m.product_name}</span>
                  <span className="block truncate text-[11.5px] text-ink-3">
                    {[m.model, m.color].filter(Boolean).join(" · ")}{m.via ? `${m.model || m.color ? " · " : ""}has Child SKU ${m.via}` : ""}
                  </span>
                </span>
                {m.listing_count !== undefined && <span className="tnum text-[11.5px] text-ink-3">{m.listing_count} listings</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
