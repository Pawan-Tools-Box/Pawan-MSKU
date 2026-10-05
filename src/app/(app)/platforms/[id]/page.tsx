"use client";
import { useParams } from "next/navigation";
import { Plus, Upload } from "lucide-react";
import { useEffect, useState } from "react";
import { apiFetch, fmtDateTime, fmtNum, useApi } from "@/components/api";
import { PlatformFields, type PlatformFormState } from "@/components/PlatformForm";
import { useSession } from "@/components/session";
import {
  Badge, Button, Checkbox, Empty, ErrorNote, Field, Input, LinkButton, Modal, PageHeader, Panel, PlatformMark, Select, Spinner, StatusBadge, useFeedback,
} from "@/components/ui";
import type { getPlatform } from "@/server/platforms";
import { COMMON_LISTING_FIELDS, type PlatformField } from "@/server/types";

type Data = { platform: Awaited<ReturnType<typeof getPlatform>> };
const TYPE_LABEL: Record<string, string> = { text: "Text", number: "Number", date: "Date", url: "Link", boolean: "Yes / No", select: "Dropdown" };

function FieldModal({ platformId, field, onClose, onSaved }: { platformId: number; field?: PlatformField; onClose: () => void; onSaved: () => void }) {
  const fb = useFeedback();
  const [f, setF] = useState({
    field_label: field?.field_label ?? "", field_type: field?.field_type ?? "text", options: (field?.options ?? []).join(", "),
    required: field?.required ?? false, searchable: field?.searchable ?? true, sortable: field?.sortable ?? false,
    is_primary_identifier: field?.is_primary_identifier ?? false, use_for_matching: field?.use_for_matching ?? false,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    setBusy(true); setError(null);
    try {
      const body = { ...f, options: f.field_type === "select" ? f.options.split(",").map((s) => s.trim()).filter(Boolean) : null };
      if (field) await apiFetch(`/api/platforms/${platformId}/fields/${field.id}`, { method: "PATCH", body });
      else await apiFetch(`/api/platforms/${platformId}/fields`, { body });
      fb.success(field ? "Field saved" : `${f.field_label} added`);
      onSaved();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  return (
    <Modal title={field ? `Edit ${field.field_label}` : "Add custom field"} onClose={onClose}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={save}>{field ? "Save field" : "Add field"}</Button></>}>
      <div className="space-y-3">
        {error && <ErrorNote>{error}</ErrorNote>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Field name" required><Input value={f.field_label} placeholder="Style ID" autoFocus onChange={(e) => setF({ ...f, field_label: e.target.value })} /></Field>
          <Field label="Field type">
            <Select value={f.field_type} onChange={(e) => setF({ ...f, field_type: e.target.value as PlatformField["field_type"] })}>
              {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </Field>
        </div>
        {f.field_type === "select" && <Field label="Options" hint="Separate with commas."><Input value={f.options} onChange={(e) => setF({ ...f, options: e.target.value })} placeholder="FBA, Self ship" /></Field>}
        <div className="grid gap-2 sm:grid-cols-2">
          <Checkbox label="Required" checked={f.required} onChange={(e) => setF({ ...f, required: e.target.checked })} />
          <Checkbox label="Searchable in global search" checked={f.searchable} onChange={(e) => setF({ ...f, searchable: e.target.checked })} />
          <Checkbox label="Sortable in listing tables" checked={f.sortable} onChange={(e) => setF({ ...f, sortable: e.target.checked })} />
          <Checkbox label="This is the platform's Product ID" checked={f.is_primary_identifier} onChange={(e) => setF({ ...f, is_primary_identifier: e.target.checked, use_for_matching: e.target.checked || f.use_for_matching })} />
          <Checkbox label="Use for automatic matching" checked={f.use_for_matching} onChange={(e) => setF({ ...f, use_for_matching: e.target.checked })} />
        </div>
        <p className="text-[12px] text-ink-3">Tick “use for automatic matching” only when one value always means one product (ASIN, FSN, Style ID). Leave it off for values shared by several products, such as a parent SKU.</p>
      </div>
    </Modal>
  );
}

export default function PlatformDetailPage() {
  const { id } = useParams<{ id: string }>();
  const fb = useFeedback();
  const { can } = useSession();
  const manage = can("platform.manage");
  const { data, loading, error, reload } = useApi<Data>(`/api/platforms/${id}`);
  const settings = useApi<{ settings: { platformTypes: string[] } }>("/api/settings");
  const [form, setForm] = useState<PlatformFormState | null>(null);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [fieldModal, setFieldModal] = useState<{ field?: PlatformField } | null>(null);
  const p = data?.platform;

  useEffect(() => {
    if (p) setForm({
      platform_name: p.platform_name, platform_code: p.platform_code, platform_type: p.platform_type, website_url: p.website_url ?? "",
      logo: p.logo ?? "", brand_color: p.brand_color ?? "#2D735D", description: p.description ?? "", listing_url_template: p.listing_url_template ?? "", status: p.status,
    });
  }, [p]);

  if (loading && !data) return <Spinner />;
  if (error || !p || !form) return <ErrorNote>{error ?? "Platform not found."}</ErrorNote>;

  const save = async () => {
    setBusy(true); setSaveError(null);
    try { await apiFetch(`/api/platforms/${p.id}`, { method: "PATCH", body: form }); fb.success("Platform saved"); reload(); }
    catch (e) { setSaveError((e as Error).message); }
    finally { setBusy(false); }
  };
  const removeField = async (f: PlatformField) => {
    if (!(await fb.confirm({ title: `Remove ${f.field_label}?`, danger: true, confirmLabel: "Remove field", body: "The field disappears from forms, imports and reports. Values already stored are kept in the database." }))) return;
    try { await apiFetch(`/api/platforms/${p.id}/fields/${f.id}`, { method: "DELETE" }); fb.success(`${f.field_label} removed`); reload(); } catch (e) { fb.error((e as Error).message); }
  };
  const removeTemplate = async (tid: number) => {
    if (!(await fb.confirm({ title: "Delete this import template?", danger: true, confirmLabel: "Delete template", body: "The next import for this platform will ask you to map the columns again." }))) return;
    try { await apiFetch(`/api/platforms/${p.id}/templates?templateId=${tid}`, { method: "DELETE" }); fb.success("Template deleted"); reload(); } catch (e) { fb.error((e as Error).message); }
  };
  const targetLabel = (t: string) => t.startsWith("cf:") ? p.fields.find((f) => f.field_name === t.slice(3))?.field_label ?? t.slice(3) : t === "master_sku" ? "Master SKU" : COMMON_LISTING_FIELDS.find((c) => c.key === t)?.label ?? t;

  return (
    <>
      <PageHeader
        back={{ href: "/platforms", label: "E-Commerce Platforms" }}
        title={<span className="flex items-center gap-2.5"><PlatformMark name={p.platform_name} color={p.brand_color} logo={p.logo} size={30} />{p.platform_name} <StatusBadge status={p.status} /></span>}
        description={`${fmtNum(p.listings)} listings · code ${p.platform_code}`}
        actions={<>
          <LinkButton href={`/listings?platformId=${p.id}`}>View listings</LinkButton>
          {can("import.run") && p.status !== "ARCHIVED" && <LinkButton href={`/import?platformId=${p.id}`} variant="primary" icon={<Upload className="size-3.5" />}>Import {p.platform_name} file</LinkButton>}
        </>}
      />
      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="Platform profile">
          {saveError && <ErrorNote className="mb-3">{saveError}</ErrorNote>}
          <fieldset disabled={!manage} className="min-w-0">
            <PlatformFields value={form} onChange={setForm} types={settings.data?.settings.platformTypes ?? []} />
          </fieldset>
          {manage && <div className="mt-4 flex justify-end"><Button variant="primary" loading={busy} onClick={save}>Save platform</Button></div>}
        </Panel>

        <div className="space-y-5">
          <Panel title="Platform fields" pad={false} actions={manage && <Button size="sm" icon={<Plus className="size-3.5" />} onClick={() => setFieldModal({})}>Add custom field</Button>}>
            <div className="border-b border-line px-4 py-3">
              <p className="text-[12.5px] text-ink-3">Standard fields on every platform</p>
              <p className="mt-1.5 flex flex-wrap gap-1.5">{COMMON_LISTING_FIELDS.map((c) => <span key={c.key} className="rounded bg-line-2 px-1.5 py-0.5 text-[12px] text-ink-2">{c.label}</span>)}</p>
            </div>
            {p.fields.length === 0 ? <Empty title={`No ${p.platform_name}-specific fields yet`}>Add identifiers this platform uses, such as ASIN, FSN, Style ID or Catalogue ID.</Empty> : (
              <div className="overflow-x-auto">
                <table className="tbl">
                  <thead><tr><th>Field</th><th>Type</th><th>Behaviour</th><th className="w-[1%]"><span className="sr-only">Actions</span></th></tr></thead>
                  <tbody>
                    {p.fields.map((f) => (
                      <tr key={f.id}>
                        <td><p className="font-medium">{f.field_label}</p><p className="font-mono text-[11.5px] text-ink-3">{f.field_name}</p></td>
                        <td>{TYPE_LABEL[f.field_type]}</td>
                        <td>
                          <span className="flex flex-wrap gap-1">
                            {f.is_primary_identifier && <Badge tone="info">Product ID</Badge>}
                            {f.use_for_matching && <Badge tone="info">Auto-matching</Badge>}
                            {f.required && <Badge tone="review">Required</Badge>}
                            {f.searchable && <Badge>Searchable</Badge>}
                            {f.sortable && <Badge>Sortable</Badge>}
                          </span>
                        </td>
                        <td>{manage && <div className="flex justify-end gap-1.5"><Button size="sm" onClick={() => setFieldModal({ field: f })}>Edit</Button><Button size="sm" variant="danger" onClick={() => removeField(f)}>Remove</Button></div>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <Panel title="Import template" pad={false}>
            {p.templates.length === 0 ? (
              <Empty title="No saved column mapping yet" action={can("import.run") && p.status !== "ARCHIVED" ? <LinkButton href={`/import?platformId=${p.id}`} variant="primary">Import a {p.platform_name} file</LinkButton> : undefined}>
                Import a file once and map its columns. The mapping is saved here and reused automatically.
              </Empty>
            ) : p.templates.map((t) => (
              <div key={t.id} className="border-b border-line last:border-0">
                <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                  <p className="text-[13px]"><span className="font-medium">{t.template_name}</span> <span className="text-ink-3">· header in row {t.header_row}, data from row {t.data_start_row} · saved {fmtDateTime(t.updated_at)}</span></p>
                  {manage && <Button size="sm" variant="danger" onClick={() => removeTemplate(t.id)}>Delete</Button>}
                </div>
                <table className="tbl">
                  <thead><tr><th>Column in the file</th><th>Goes to</th></tr></thead>
                  <tbody>{Object.entries(t.column_map).map(([col, target]) => <tr key={col}><td className="font-mono text-[12.5px]">{col}</td><td>{targetLabel(target)}</td></tr>)}</tbody>
                </table>
              </div>
            ))}
          </Panel>
        </div>
      </div>
      {fieldModal && <FieldModal platformId={p.id} field={fieldModal.field} onClose={() => setFieldModal(null)} onSaved={() => { setFieldModal(null); reload(); }} />}
    </>
  );
}
