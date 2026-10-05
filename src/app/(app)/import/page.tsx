"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Check, Download, FileUp } from "lucide-react";
import { useRef, useState } from "react";
import { apiFetch, fmtDateTime, fmtNum, qs, useApi } from "@/components/api";
import { usePlatforms } from "@/components/platforms";
import { useSession } from "@/components/session";
import {
  Button, Checkbox, cn, Empty, ErrorNote, Field, Input, LinkButton, MappingBadge, MasterTag, Note, PageHeader, Pagination, Panel, PlatformName, Select,
  Spinner, StatusBadge, Tabs,
} from "@/components/ui";
import type { describeImport, ImportConfig, ImportCounts, ImportLogRow } from "@/server/imports";
import type { Paged } from "@/server/types";

type Describe = Awaited<ReturnType<typeof describeImport>>;
interface SampleRow { row: number; child_sku: string | null; listing_name: string | null; product_id: string | null; outcome: string; mapping_status: string | null; master_sku: string | null; confidence: number | null; message: string | null }
interface Preview { counts: ImportCounts; samples: Record<"mapped" | "review" | "unmapped" | "duplicates" | "errors" | "warnings", SampleRow[]> }

const STEPS = ["Platform and file", "Map columns", "Check", "Done"];

function Stepper({ step }: { step: number }) {
  return (
    <ol className="mb-5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
      {STEPS.map((s, i) => (
        <li key={s} className="flex items-center gap-2">
          <span className={cn("flex size-6 items-center justify-center rounded-full text-[12px] font-semibold", i < step ? "bg-mapped text-white" : i === step ? "bg-canopy-800 text-white" : "bg-line text-ink-3")}>
            {i < step ? <Check className="size-3.5" /> : i + 1}
          </span>
          <span className={cn(i === step ? "font-semibold" : "text-ink-3")}>{s}</span>
          {i < STEPS.length - 1 && <span className="mx-1 h-px w-8 bg-line" />}
        </li>
      ))}
    </ol>
  );
}

function Counts({ c, final }: { c: ImportCounts; final?: boolean }) {
  const cells: [string, number, string?][] = [
    ["Total records", c.total], [final ? "Mapped" : "Potentially mapped", c.mapped, "text-mapped"], ["Unmapped", c.unmapped, c.unmapped ? "text-unmapped" : ""],
    ["Needs review", c.review, c.review ? "text-review" : ""], ["Duplicates", c.duplicates, c.duplicates ? "text-review" : ""], ["Errors", c.errors, c.errors ? "text-unmapped" : ""],
  ];
  return (
    <>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-3 lg:grid-cols-6">
        {cells.map(([k, v, cls]) => (
          <div key={k} className="bg-card px-4 py-3"><p className="text-[12.5px] text-ink-3">{k}</p><p className={cn("tnum mt-0.5 text-[24px] font-semibold leading-tight", cls)}>{fmtNum(v)}</p></div>
        ))}
      </div>
      <p className="mt-2 text-[12.5px] text-ink-3">{fmtNum(c.new)} new listing{c.new === 1 ? "" : "s"}, {fmtNum(c.updated)} already in the CRM {final ? "and updated" : "and will be updated"} (existing mappings are kept).</p>
    </>
  );
}

function SampleTable({ rows }: { rows: SampleRow[] }) {
  if (!rows.length) return <p className="px-4 py-6 text-center text-[13px] text-ink-3">No rows in this group.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="tbl">
        <thead><tr><th className="w-16">Row</th><th>Child SKU</th><th>Listing name</th><th>Result</th><th>Master SKU</th><th>Notes</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.row}>
              <td className="tnum text-ink-3">{r.row}</td>
              <td className="max-w-[220px] truncate font-mono text-[12.5px]">{r.child_sku || <span className="font-sans text-unmapped">empty</span>}</td>
              <td className="max-w-[320px]"><p className="line-clamp-1" title={r.listing_name ?? undefined}>{r.listing_name || "—"}</p></td>
              <td className="whitespace-nowrap">{r.outcome === "ERROR" || r.outcome === "DUPLICATE" ? <StatusBadge status={r.outcome} /> : <MappingBadge status={r.mapping_status} confidence={r.confidence} />}</td>
              <td>{r.master_sku ? <MasterTag sku={r.master_sku} /> : <span className="text-ink-3">—</span>}</td>
              <td className="max-w-[360px] text-[12.5px] text-ink-2">{r.message}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Wizard({ onFinished }: { onFinished: () => void }) {
  const sp = useSearchParams();
  const { refreshCounts, can } = useSession();
  const { platforms } = usePlatforms();
  const input = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState(0);
  const [platformId, setPlatformId] = useState(sp.get("platformId") ?? "");
  const [d, setD] = useState<Describe | null>(null);
  const [config, setConfig] = useState<ImportConfig | null>(null);
  const [remember, setRemember] = useState(true);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [sampleTab, setSampleTab] = useState<keyof Preview["samples"]>("unmapped");
  const [result, setResult] = useState<{ importId: number; counts: ImportCounts } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const usable = platforms.filter((p) => p.status !== "ARCHIVED");
  const platform = usable.find((p) => String(p.id) === platformId);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    if (!platformId) { setError("Please select a valid platform."); return; }
    setBusy(true); setError(null);
    try {
      const form = new FormData();
      form.set("platformId", platformId);
      form.set("file", file);
      const r = await apiFetch<Describe>("/api/imports", { form });
      setD(r); setConfig(r.config); setStep(1);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  const reshape = async (patch: { sheet?: string; headerRow?: number; dataStartRow?: number }) => {
    if (!d || !config) return;
    setBusy(true); setError(null);
    try {
      const r = await apiFetch<Describe>(`/api/imports/${d.import.id}/describe${qs({ sheet: patch.sheet ?? config.sheetName, headerRow: patch.sheet ? undefined : patch.headerRow ?? config.headerRow, dataStartRow: patch.dataStartRow })}`);
      setD(r); setConfig(r.config);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  const check = async () => {
    if (!d || !config) return;
    setBusy(true); setError(null);
    try {
      const r = await apiFetch<Preview>(`/api/imports/${d.import.id}/preview`, { body: { config } });
      setPreview(r);
      setSampleTab(r.counts.errors ? "errors" : r.counts.unmapped ? "unmapped" : r.counts.review ? "review" : "mapped");
      setStep(2);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  const commit = async () => {
    if (!d) return;
    setBusy(true); setError(null);
    try {
      const r = await apiFetch<{ importId: number; counts: ImportCounts }>(`/api/imports/${d.import.id}/commit`, { body: { saveTemplate: remember } });
      setResult(r); setStep(3); refreshCounts(); onFinished();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  const restart = () => { setStep(0); setD(null); setConfig(null); setPreview(null); setResult(null); setError(null); };
  const cancel = async () => { if (d) await apiFetch(`/api/imports/${d.import.id}/cancel`, { method: "POST", body: {} }).catch(() => {}); restart(); };
  const mappedTargets = new Set(Object.values(config?.columnMap ?? {}));
  const groups = d ? [...new Set(d.targets.map((t) => t.group))] : [];

  return (
    <Panel>
      <Stepper step={step} />
      {error && <ErrorNote className="mb-4">{error}</ErrorNote>}

      {step === 0 && (
        <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
          <div>
            <Field label="Select platform" required hint="Platforms are managed under E-Commerce Platforms. Add a new one there and it appears here.">
              <Select value={platformId} onChange={(e) => { setPlatformId(e.target.value); setError(null); }}>
                <option value="">Select platform…</option>
                {usable.map((p) => <option key={p.id} value={p.id}>{p.platform_name}{p.status !== "ACTIVE" ? " (inactive)" : ""}</option>)}
              </Select>
            </Field>
            {platform && (
              <p className="mt-3 text-[12.5px] text-ink-3">
                {platform.fields.length ? <>Fields for {platform.platform_name}: {platform.fields.map((f) => f.field_label).join(", ")}.</> : <>{platform.platform_name} uses the standard fields only.</>}
              </p>
            )}
          </div>
          <div>
            <input ref={input} type="file" accept=".xlsx,.xls,.csv,.tsv,.txt" hidden onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ""; }} />
            <button
              type="button" disabled={busy} onClick={() => (platformId ? input.current?.click() : setError("Please select a valid platform."))}
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); upload(e.dataTransfer.files?.[0]); }}
              className={cn("flex w-full flex-col items-center gap-1.5 rounded-lg border-2 border-dashed px-4 py-12 text-center transition-colors", drag ? "border-canopy-600 bg-canopy-50" : "border-line hover:border-canopy-600 hover:bg-canopy-50")}
            >
              {busy ? <Spinner label="Reading the file…" /> : <>
                <FileUp className="size-6 text-ink-3" />
                <span className="text-[14.5px] font-medium">Drop the marketplace file here, or choose a file</span>
                <span className="text-[12.5px] text-ink-3">Excel (.xlsx, .xls) or CSV, exactly as downloaded from the platform</span>
              </>}
            </button>
          </div>
        </div>
      )}

      {step === 1 && d && config && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="mr-auto min-w-0">
              <p className="text-[14.5px] font-semibold">{d.import.file_name}</p>
              <p className="text-[12.5px] text-ink-3"><PlatformName name={d.platform!.platform_name} color={platform?.brand_color} logo={platform?.logo} /> · {fmtNum(d.dataRows)} data rows found</p>
            </div>
            {d.sheets.length > 1 && (
              <Field label="Sheet"><Select value={config.sheetName} onChange={(e) => reshape({ sheet: e.target.value })} className="w-auto max-w-[240px]">{d.sheets.map((s) => <option key={s.name} value={s.name}>{s.name} ({fmtNum(s.rows)} rows)</option>)}</Select></Field>
            )}
            <Field label="Header row"><Input type="number" min={1} value={config.headerRow} onChange={(e) => { const n = Number(e.target.value); if (n >= 1) reshape({ headerRow: n }); }} className="w-24" /></Field>
            <Field label="First data row"><Input type="number" min={config.headerRow + 1} value={config.dataStartRow} onChange={(e) => { const n = Number(e.target.value); if (n > config.headerRow) reshape({ dataStartRow: n }); }} className="w-24" /></Field>
          </div>
          {d.template?.applied
            ? <Note>The saved {d.platform!.platform_name} template was applied. Check the mapping and continue.</Note>
            : <Note tone="review">{d.template ? `The saved template does not fit this file's columns, so the mapping below was guessed from the column names.` : `No template saved for ${d.platform!.platform_name} yet. The mapping below was guessed from the column names; correct it once and it will be remembered.`}</Note>}
          {!mappedTargets.has("child_sku") && <ErrorNote>Map one column to Child SKU. It is the only required field.</ErrorNote>}
          <div className="overflow-x-auto rounded-md border border-line">
            <table className="tbl">
              <thead><tr><th>Uploaded column</th><th>Sample values</th><th className="w-[280px]">Map to</th></tr></thead>
              <tbody>
                {d.headers.map((h) => {
                  const cur = config.columnMap[h] ?? "";
                  return (
                    <tr key={h} className={cn(cur && "[&>td]:bg-canopy-50/50")}>
                      <td className="max-w-[260px] font-medium">{h}</td>
                      <td className="max-w-[420px] text-[12.5px] text-ink-3"><p className="line-clamp-2">{d.sample.map((s) => s[h]).filter(Boolean).slice(0, 3).join("  ·  ") || "empty"}</p></td>
                      <td>
                        <Select value={cur} aria-label={`Map ${h} to`} onChange={(e) => setConfig({ ...config, columnMap: (() => { const m = { ...config.columnMap }; if (e.target.value) m[h] = e.target.value; else delete m[h]; return m; })() })}>
                          <option value="">Do not map (kept in original data)</option>
                          {groups.map((g) => (
                            <optgroup key={g} label={g === "Platform fields" ? `${d.platform!.platform_name} fields` : g}>
                              {d.targets.filter((t) => t.group === g).map((t) => <option key={t.key} value={t.key} disabled={mappedTargets.has(t.key) && cur !== t.key}>{t.label}{t.required ? " (required)" : ""}</option>)}
                            </optgroup>
                          ))}
                        </Select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Checkbox label={`Remember this mapping for ${d.platform!.platform_name} imports`} checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            <span className="ml-auto" />
            <Button onClick={cancel}>Cancel</Button>
            <Button variant="primary" loading={busy} disabled={!mappedTargets.has("child_sku")} onClick={check}>Check file</Button>
          </div>
        </div>
      )}

      {step === 2 && preview && d && (
        <div className="space-y-4">
          <Counts c={preview.counts} />
          <Note>Nothing has been saved yet. Every row with a Child SKU will be kept: matched rows are mapped, uncertain ones go to Needs Review, the rest go to Unmapped SKUs.</Note>
          <div className="rounded-md border border-line">
            <div className="px-3 pt-2">
              <Tabs value={sampleTab} onChange={setSampleTab} tabs={[
                { value: "mapped", label: "Mapped", count: preview.counts.mapped }, { value: "review", label: "Needs review", count: preview.counts.review },
                { value: "unmapped", label: "Unmapped", count: preview.counts.unmapped }, { value: "duplicates", label: "Duplicates", count: preview.counts.duplicates },
                { value: "errors", label: "Errors", count: preview.counts.errors }, { value: "warnings", label: "Notes", count: preview.samples.warnings.length },
              ]} />
            </div>
            <SampleTable rows={preview.samples[sampleTab]} />
            <p className="border-t border-line px-4 py-2 text-[12px] text-ink-3">Showing up to 25 rows per group. The full list is in the import report afterwards.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button icon={<ArrowLeft className="size-3.5" />} onClick={() => setStep(1)}>Back to mapping</Button>
            <span className="ml-auto" />
            <Button onClick={cancel}>Cancel</Button>
            <Button variant="primary" loading={busy} disabled={preview.counts.total === preview.counts.errors + preview.counts.duplicates} onClick={commit}>Confirm import</Button>
          </div>
        </div>
      )}

      {step === 3 && result && (
        <div className="space-y-4">
          <p className="text-[18px] font-semibold">Import completed</p>
          <Counts c={result.counts} final />
          <div className="flex flex-wrap gap-2">
            <LinkButton href={`/import/${result.importId}?mappingStatus=MAPPED`}>View mapped</LinkButton>
            <LinkButton href={`/import/${result.importId}?mappingStatus=UNMAPPED`}>View unmapped</LinkButton>
            <LinkButton href={`/import/${result.importId}?mappingStatus=NEEDS_REVIEW`}>View needs review</LinkButton>
            {can("export.run") && <LinkButton href={`/api/imports/${result.importId}/report`} icon={<Download className="size-3.5" />}>Download report</LinkButton>}
            <span className="ml-auto" />
            <Button variant="primary" onClick={restart}>Import another file</Button>
          </div>
        </div>
      )}
    </Panel>
  );
}

export default function ImportPage() {
  const { can } = useSession();
  const [page, setPage] = useState(1);
  const history = useApi<Paged<ImportLogRow>>(`/api/imports${qs({ page, pageSize: 15 })}`);
  return (
    <>
      <PageHeader title="Import Data" description="Upload a marketplace file, map its columns once, and the CRM matches every Child SKU to a Master SKU where it can." />
      {can("import.run") ? <Wizard onFinished={history.reload} /> : <Note>You can see past imports. Ask an admin for permission to run imports.</Note>}
      <div className="mt-6">
        <Panel title="Import history" pad={false}>
          {history.loading && !history.data ? <Spinner /> : !history.data?.rows.length ? <Empty title="No imports yet">Completed imports are listed here with their record counts.</Empty> : (
            <>
              <div className="overflow-x-auto">
                <table className="tbl">
                  <thead><tr><th>Date</th><th>File</th><th>Platform</th><th className="num">Total</th><th className="num">Mapped</th><th className="num">Unmapped</th><th className="num">Review</th><th className="num">Duplicates</th><th className="num">Errors</th><th>Imported by</th></tr></thead>
                  <tbody>
                    {history.data.rows.map((i) => (
                      <tr key={i.id}>
                        <td className="whitespace-nowrap text-ink-2">{fmtDateTime(i.created_at)}</td>
                        <td className="max-w-[260px] truncate"><Link href={`/import/${i.id}`} className="font-medium text-canopy-700 hover:underline">{i.file_name}</Link>{i.status === "FAILED" && <span className="ml-2"><StatusBadge status="FAILED" /></span>}</td>
                        <td><PlatformName name={i.platform_name} color={i.platform_color} /></td>
                        <td className="num">{fmtNum(i.total_records)}</td><td className="num">{fmtNum(i.mapped_records)}</td><td className="num">{fmtNum(i.unmapped_records)}</td>
                        <td className="num">{fmtNum(i.review_records)}</td><td className="num">{fmtNum(i.duplicate_records)}</td><td className="num">{fmtNum(i.error_records)}</td>
                        <td>{i.imported_by_name ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination page={history.data.page} pageSize={history.data.pageSize} total={history.data.total} onPage={setPage} />
            </>
          )}
        </Panel>
      </div>
    </>
  );
}
