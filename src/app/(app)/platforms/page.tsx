"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { apiFetch, fmtNum, useApi } from "@/components/api";
import { EMPTY_PLATFORM, PlatformFields, type PlatformFormState } from "@/components/PlatformForm";
import type { PlatformFull } from "@/components/platforms";
import { useSession } from "@/components/session";
import { Button, Checkbox, Empty, ErrorNote, Input, LinkButton, Menu, Modal, Note, PageHeader, Panel, PlatformMark, Select, Spinner, StatusBadge, useFeedback } from "@/components/ui";
import { COMMON_LISTING_FIELDS } from "@/server/types";

interface NewField { field_label: string; field_type: string; required: boolean; is_primary_identifier: boolean }

function AddPlatformModal({ types, onClose, onCreated }: { types: string[]; onClose: () => void; onCreated: (id: number) => void }) {
  const fb = useFeedback();
  const [f, setF] = useState<PlatformFormState>(EMPTY_PLATFORM);
  const [fields, setFields] = useState<NewField[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setField = (i: number, patch: Partial<NewField>) => setFields((x) => x.map((r, j) => (j === i ? { ...r, ...patch } : patch.is_primary_identifier ? { ...r, is_primary_identifier: false } : r)));
  const create = async () => {
    setBusy(true); setError(null);
    try {
      const r = await apiFetch<{ platform: { id: number; platform_name: string } }>("/api/platforms", {
        body: { ...f, fields: fields.filter((x) => x.field_label.trim()).map((x) => ({ ...x, use_for_matching: x.is_primary_identifier })) },
      });
      fb.success(`${r.platform.platform_name} is now available across the CRM`);
      onCreated(r.platform.id);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  return (
    <Modal
      title="Add e-commerce platform" size="lg" onClose={onClose}
      subtitle="Once saved, the platform appears in imports, listings, coverage, reports and search. No code or database change is needed."
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={create}>Create platform</Button></>}
    >
      <div className="space-y-5">
        {error && <ErrorNote>{error}</ErrorNote>}
        <PlatformFields value={f} onChange={setF} types={types} isNew />
        <div>
          <p className="text-[13.5px] font-semibold">Fields</p>
          <p className="mt-0.5 text-[12.5px] text-ink-3">Every platform has these standard fields:</p>
          <p className="mt-1.5 flex flex-wrap gap-1.5">{COMMON_LISTING_FIELDS.map((c) => <span key={c.key} className="rounded bg-line-2 px-1.5 py-0.5 text-[12px] text-ink-2">{c.label}</span>)}</p>
          <p className="mt-3 text-[12.5px] text-ink-3">Add the identifiers only this platform has, such as Style ID or Catalogue ID. You can add more later.</p>
          <div className="mt-2 space-y-2">
            {fields.map((x, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2 rounded-md border border-line p-2">
                <Input value={x.field_label} onChange={(e) => setField(i, { field_label: e.target.value })} placeholder="Field name, e.g. Style ID" className="w-full sm:w-[200px]" aria-label="Field name" />
                <Select value={x.field_type} onChange={(e) => setField(i, { field_type: e.target.value })} className="w-auto" aria-label="Field type">
                  <option value="text">Text</option><option value="number">Number</option><option value="date">Date</option><option value="url">Link</option><option value="boolean">Yes / No</option>
                </Select>
                <Checkbox label="Required" checked={x.required} onChange={(e) => setField(i, { required: e.target.checked })} />
                <Checkbox label="This is the platform's Product ID" checked={x.is_primary_identifier} onChange={(e) => setField(i, { is_primary_identifier: e.target.checked })} />
                <button type="button" aria-label="Remove field" onClick={() => setFields((s) => s.filter((_, j) => j !== i))} className="ml-auto rounded p-1 text-ink-3 hover:bg-unmapped-bg hover:text-unmapped"><Trash2 className="size-4" /></button>
              </div>
            ))}
            <Button icon={<Plus className="size-3.5" />} onClick={() => setFields((s) => [...s, { field_label: "", field_type: "text", required: false, is_primary_identifier: false }])}>Add custom field</Button>
          </div>
        </div>
        <Note>Import template: the first time you import a file for this platform you map its columns once, and the CRM remembers the mapping for next time.</Note>
      </div>
    </Modal>
  );
}

export default function PlatformsPage() {
  const router = useRouter();
  const fb = useFeedback();
  const { can } = useSession();
  const [all, setAll] = useState(false);
  const { data, loading, error, reload } = useApi<{ platforms: PlatformFull[] }>(`/api/platforms?fields=1${all ? "&all=1" : ""}`);
  const settings = useApi<{ settings: { platformTypes: string[] } }>("/api/settings");
  const [adding, setAdding] = useState(false);
  const manage = can("platform.manage");

  const setStatus = async (p: PlatformFull, status: string) => {
    if (status === "ARCHIVED" && !(await fb.confirm({
      title: `Archive ${p.platform_name}?`, danger: true, confirmLabel: "Archive platform",
      body: `The platform leaves imports, filters and coverage. Its ${fmtNum(p.listings)} listings are kept and it can be reactivated at any time.`,
    }))) return;
    try {
      await apiFetch(`/api/platforms/${p.id}`, { method: "PATCH", body: { status } });
      fb.success(`${p.platform_name} is now ${status.toLowerCase()}`);
      reload();
    } catch (e) { fb.error((e as Error).message); }
  };

  return (
    <>
      <PageHeader
        title="E-Commerce Platforms"
        description="Every marketplace or website you sell on. Platforms are configuration: add one here and the whole CRM supports it."
        actions={manage && <Button variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setAdding(true)}>Add platform</Button>}
      />
      <Panel pad={false}>
        <div className="flex items-center justify-end border-b border-line px-3 py-2"><Checkbox label="Show archived" checked={all} onChange={(e) => setAll(e.target.checked)} /></div>
        {error ? <div className="p-4"><ErrorNote>{error}</ErrorNote></div> : loading && !data ? <Spinner /> : !data?.platforms.length ? (
          <Empty title="No platforms yet" action={manage ? <Button variant="primary" onClick={() => setAdding(true)}>Add platform</Button> : undefined}>Add Amazon, Flipkart or any other place you list products.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead><tr><th>Platform</th><th>Code</th><th>Type</th><th>Status</th><th>Platform fields</th><th className="num">Listings</th><th className="num">Unmapped</th><th className="w-[1%]"><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {data.platforms.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <div className="flex items-center gap-2.5">
                        <PlatformMark name={p.platform_name} color={p.brand_color} logo={p.logo} size={28} />
                        <div className="min-w-0">
                          <Link href={`/platforms/${p.id}`} className="font-medium hover:text-canopy-700 hover:underline">{p.platform_name}</Link>
                          {p.website_url && <p className="truncate text-[12px] text-ink-3">{p.website_url.replace(/^https?:\/\//, "")}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="font-mono text-[12.5px]">{p.platform_code}</td>
                    <td>{p.platform_type}</td>
                    <td><StatusBadge status={p.status} /></td>
                    <td className="max-w-[280px]"><span className="flex flex-wrap gap-1">{p.fields.length ? p.fields.map((x) => <span key={x.id} className="rounded bg-line-2 px-1.5 py-0.5 text-[11.5px] text-ink-2">{x.field_label}</span>) : <span className="text-ink-3">Standard fields only</span>}</span></td>
                    <td className="num"><Link href={`/listings?platformId=${p.id}`} className="font-medium hover:underline">{fmtNum(p.listings)}</Link></td>
                    <td className="num">{p.unmapped + p.remapping > 0 ? <Link href={`/unmapped?platformId=${p.id}`} className="font-medium text-unmapped hover:underline">{fmtNum(p.unmapped + p.remapping)}</Link> : 0}</td>
                    <td>
                      <div className="flex items-center justify-end gap-1.5">
                        {manage && <LinkButton size="sm" href={`/platforms/${p.id}`}>Edit</LinkButton>}
                        {manage && (
                          <Menu items={[
                            { label: "Activate", onClick: () => setStatus(p, "ACTIVE"), hidden: p.status === "ACTIVE" },
                            { label: "Deactivate", onClick: () => setStatus(p, "INACTIVE"), hidden: p.status !== "ACTIVE" },
                            { label: "Archive", danger: true, onClick: () => setStatus(p, "ARCHIVED"), hidden: p.status === "ARCHIVED" },
                          ]}><MoreHorizontal className="size-4" /></Menu>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      {adding && <AddPlatformModal types={settings.data?.settings.platformTypes ?? ["Marketplace"]} onClose={() => setAdding(false)} onCreated={(id) => { setAdding(false); router.push(`/platforms/${id}`); }} />}
    </>
  );
}
