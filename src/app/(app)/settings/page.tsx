"use client";
import { useEffect, useState } from "react";
import { apiFetch, useApi } from "@/components/api";
import { Button, Checkbox, ErrorNote, Field, Input, PageHeader, Panel, Spinner, Textarea, useFeedback } from "@/components/ui";
import type { AppSettings } from "@/server/settings";

export default function SettingsPage() {
  const fb = useFeedback();
  const { data, loading, error } = useApi<{ settings: AppSettings }>("/api/settings");
  const [s, setS] = useState<AppSettings | null>(null);
  const [ignore, setIgnore] = useState("");
  const [types, setTypes] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    if (data) { setS(data.settings); setIgnore(data.settings.matching.ignoreWords.join(", ")); setTypes(data.settings.platformTypes.join("\n")); }
  }, [data]);
  if (loading && !s) return <Spinner />;
  if (error || !s) return <ErrorNote>{error}</ErrorNote>;

  const save = async (key: string, patch: Partial<AppSettings>) => {
    setBusy(key);
    try { const r = await apiFetch<{ settings: AppSettings }>("/api/settings", { method: "PUT", body: patch }); setS(r.settings); fb.success("Settings saved"); }
    catch (e) { fb.error((e as Error).message); }
    finally { setBusy(null); }
  };

  return (
    <>
      <PageHeader title="Settings" description="Rules that apply across the CRM. Platforms and their fields are managed under E-Commerce Platforms." />
      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="Automatic matching">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Map automatically at or above (%)" hint="Higher is stricter. 90 is a safe default.">
              <Input type="number" min={50} max={100} value={s.matching.autoMapThreshold} onChange={(e) => setS({ ...s, matching: { ...s.matching, autoMapThreshold: Number(e.target.value) } })} />
            </Field>
            <Field label="Send to Needs Review at or above (%)" hint="Below this a listing stays Unmapped.">
              <Input type="number" min={1} max={99} value={s.matching.reviewThreshold} onChange={(e) => setS({ ...s, matching: { ...s.matching, reviewThreshold: Number(e.target.value) } })} />
            </Field>
            <Field label="Words to ignore when comparing names" className="sm:col-span-2" hint="Usually your brand names: they appear in every listing and say nothing about which product it is.">
              <Input value={ignore} onChange={(e) => setIgnore(e.target.value)} />
            </Field>
          </div>
          <div className="mt-4 flex justify-end"><Button variant="primary" loading={busy === "matching"} onClick={() => save("matching", { matching: { ...s.matching, ignoreWords: ignore.split(",").map((w) => w.trim()).filter(Boolean) } })}>Save matching rules</Button></div>
        </Panel>

        <Panel title="Permissions">
          <div className="space-y-2.5">
            <Checkbox label="Staff can import marketplace files" checked={s.permissions.staffCanImport} onChange={(e) => setS({ ...s, permissions: { ...s.permissions, staffCanImport: e.target.checked } })} />
            <Checkbox label="Staff can export reports" checked={s.permissions.staffCanExport} onChange={(e) => setS({ ...s, permissions: { ...s.permissions, staffCanExport: e.target.checked } })} />
            <Checkbox label="Staff can create and edit Master SKUs" checked={s.permissions.staffCanCreateMasters} onChange={(e) => setS({ ...s, permissions: { ...s.permissions, staffCanCreateMasters: e.target.checked } })} />
            <Checkbox label="Viewers can export reports" checked={s.permissions.viewerCanExport} onChange={(e) => setS({ ...s, permissions: { ...s.permissions, viewerCanExport: e.target.checked } })} />
          </div>
          <p className="mt-3 text-[12.5px] text-ink-3">Admins can always do everything. Only admins manage platforms, users, settings and audit logs.</p>
          <div className="mt-4 flex justify-end"><Button variant="primary" loading={busy === "permissions"} onClick={() => save("permissions", { permissions: s.permissions })}>Save permissions</Button></div>
        </Panel>

        <Panel title="Company and Master SKU codes">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Company name"><Input value={s.company.name} onChange={(e) => setS({ ...s, company: { ...s.company, name: e.target.value } })} /></Field>
            <Field label="Default brand" hint="Pre-filled on new Master SKUs."><Input value={s.company.brand} onChange={(e) => setS({ ...s, company: { ...s.company, brand: e.target.value } })} /></Field>
            <Field label="Master SKU prefix" hint={`“Suggest” proposes codes like ${s.masterSku.prefix || "OC"}-MATRIX-001.`}><Input value={s.masterSku.prefix} className="font-mono" onChange={(e) => setS({ ...s, masterSku: { prefix: e.target.value.toUpperCase() } })} /></Field>
          </div>
          <div className="mt-4 flex justify-end"><Button variant="primary" loading={busy === "company"} onClick={() => save("company", { company: s.company, masterSku: s.masterSku })}>Save</Button></div>
        </Panel>

        <Panel title="Platform types">
          <Field label="One type per line" hint="Offered when you add or edit a platform."><Textarea rows={7} value={types} onChange={(e) => setTypes(e.target.value)} /></Field>
          <div className="mt-4 flex justify-end"><Button variant="primary" loading={busy === "types"} onClick={() => save("types", { platformTypes: types.split("\n").map((t) => t.trim()).filter(Boolean) })}>Save platform types</Button></div>
        </Panel>
      </div>
    </>
  );
}
