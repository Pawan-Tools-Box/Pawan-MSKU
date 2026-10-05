"use client";
import Link from "next/link";
import { ArrowUpRight, Upload } from "lucide-react";
import { fmtDateTime, fmtNum, useApi } from "@/components/api";
import { useSession } from "@/components/session";
import { cn, Empty, ErrorNote, LinkButton, PageHeader, Panel, PlatformName, Spinner, StatusBadge } from "@/components/ui";
import type { dashboard } from "@/server/dashboard";

type Data = Awaited<ReturnType<typeof dashboard>>;

const ACTION_TEXT: Record<string, string> = {
  MASTER_CREATED: "created Master SKU", MASTER_UPDATED: "edited Master SKU", MASTER_DELETED: "deleted Master SKU", MASTER_RESTORED: "restored Master SKU",
  MASTER_IMPORT: "imported Master SKUs from", PLATFORM_CREATED: "added platform", PLATFORM_UPDATED: "edited platform", PLATFORM_STATUS_CHANGED: "changed status of platform",
  PLATFORM_FIELD_ADDED: "added field", PLATFORM_FIELD_UPDATED: "edited field", PLATFORM_FIELD_REMOVED: "removed field", IMPORT_TEMPLATE_SAVED: "saved import template", IMPORT_TEMPLATE_DELETED: "deleted import template",
  LISTING_CREATED: "added listing", LISTING_UPDATED: "edited listing", LISTING_DELETED: "deleted listing", LISTING_RESTORED: "restored listing",
  MAPPED: "mapped", REMAPPED: "changed Master SKU of", UNMAPPED: "removed mapping of", REMAP_REQUESTED: "flagged for re-mapping", BULK_MAPPING: "bulk-mapped",
  EXCEL_MAPPING: "mapped by Excel", AUTO_MATCH_RUN: "re-ran auto-match:", IMPORT_COMPLETED: "imported", USER_CREATED: "added user", USER_UPDATED: "updated user", SETTINGS_UPDATED: "changed settings",
};

function Stat({ label, value, href, sub, tone }: { label: string; value: number; href: string; sub?: string; tone?: "unmapped" | "review" }) {
  return (
    <Link href={href} className="group relative block bg-card px-4 py-3.5 hover:bg-canopy-50">
      <p className="flex items-center justify-between text-[12.5px] text-ink-3">
        {label}<ArrowUpRight className="size-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
      </p>
      <p className={cn("tnum mt-1 text-[26px] font-semibold leading-none tracking-[-0.02em]", tone === "unmapped" && value > 0 && "text-unmapped", tone === "review" && value > 0 && "text-review")}>
        {fmtNum(value)}
      </p>
      <p className="mt-1.5 min-h-[16px] text-[12px] text-ink-3">{sub}</p>
    </Link>
  );
}

/** Share of a platform's listings by mapping status. Numbers are in the table beside it; the bar is a glance aid. */
function ShareBar({ mapped, review, unmapped, remapping }: { mapped: number; review: number; unmapped: number; remapping: number }) {
  const total = mapped + review + unmapped + remapping;
  if (!total) return <span className="text-[12px] text-ink-3">No listings yet</span>;
  const seg = [
    { n: mapped, cls: "bg-mapped", label: "Mapped" }, { n: review, cls: "bg-oak-600", label: "Needs review" },
    { n: remapping, cls: "bg-remap", label: "Re-mapping required" }, { n: unmapped, cls: "bg-unmapped", label: "Unmapped" },
  ].filter((s) => s.n > 0);
  return (
    <span className="flex h-2 w-full min-w-[120px] gap-[2px] overflow-hidden rounded-full" role="img" aria-label={seg.map((s) => `${s.label} ${s.n}`).join(", ")}>
      {seg.map((s) => <span key={s.label} title={`${s.label}: ${fmtNum(s.n)} (${Math.round((s.n / total) * 100)}%)`} className={cn("h-full rounded-[2px]", s.cls)} style={{ width: `${Math.max(2, (s.n / total) * 100)}%` }} />)}
    </span>
  );
}

export default function DashboardPage() {
  const { can } = useSession();
  const { data, error, loading } = useApi<Data>("/api/dashboard");
  if (loading && !data) return <Spinner />;
  if (error || !data) return <ErrorNote>{error ?? "Could not load the dashboard."}</ErrorNote>;
  const c = data.cards;
  const pending = data.platforms.filter((p) => p.status === "ACTIVE" || p.unmapped + p.remapping > 0);
  const maxUnmapped = Math.max(1, ...pending.map((p) => p.unmapped + p.remapping));

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Every Master SKU, every platform, and what still needs a decision."
        actions={can("import.run") && <LinkButton href="/import" variant="primary" icon={<Upload className="size-3.5" />}>Import marketplace file</LinkButton>}
      />

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line md:grid-cols-4">
        <Stat label="Master SKUs" value={c.masters} href="/masters" sub={c.mastersNoListings ? `${fmtNum(c.mastersNoListings)} with no listing yet` : "All have at least one listing"} />
        <Stat label="Platforms" value={c.platforms} href="/platforms" sub={c.platformsAll > c.platforms ? `${c.platformsAll - c.platforms} inactive` : "All active"} />
        <Stat label="Marketplace listings" value={c.listings} href="/listings" sub={`${fmtNum(c.mappedListings)} mapped to a Master SKU`} />
        <Stat label="Fully mapped Master SKUs" value={c.fullyMapped} href="/masters?coverage=complete" sub={`Listed on all ${c.platforms} active platforms`} />
        <Stat label="Unmapped SKUs" value={c.unmapped + c.remapping} href="/unmapped" tone="unmapped" sub={c.remapping ? `${fmtNum(c.remapping)} need re-mapping` : "Child SKUs with no Master SKU"} />
        <Stat label="Needs review" value={c.needsReview} href="/needs-review" tone="review" sub="Suggested match waiting for a yes or no" />
        <Stat label="Master SKUs with missing listings" value={c.mastersMissing} href="/masters?coverage=missing" sub="Not on every active platform" />
        <Stat label="Inactive listings" value={c.inactiveListings} href="/listings?inactive=1" sub="Inactive, incomplete or archived" />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Panel title="Platform summary" pad={false} actions={<Link href="/reports/platform-summary" className="text-[12.5px] font-medium text-canopy-700 hover:underline">Open report</Link>}>
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead><tr><th>Platform</th><th className="num">Total listings</th><th className="num">Mapped</th><th className="num">Unmapped</th><th className="num">Needs review</th><th className="num">Active</th><th className="num">Inactive</th><th className="w-[18%]">Mapping share</th></tr></thead>
              <tbody>
                {data.platforms.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <Link href={`/listings?platformId=${p.id}`} className="hover:underline"><PlatformName name={p.platform_name} color={p.brand_color} logo={p.logo} /></Link>
                      {p.status !== "ACTIVE" && <span className="ml-2 align-middle"><StatusBadge status={p.status} /></span>}
                    </td>
                    <td className="num font-medium">{fmtNum(p.listings)}</td>
                    <td className="num">{fmtNum(p.mapped)}</td>
                    <td className="num">{p.unmapped + p.remapping > 0 ? <Link href={`/unmapped?platformId=${p.id}`} className="font-medium text-unmapped hover:underline">{fmtNum(p.unmapped + p.remapping)}</Link> : 0}</td>
                    <td className="num">{p.needs_review > 0 ? <Link href={`/needs-review?platformId=${p.id}`} className="font-medium text-review hover:underline">{fmtNum(p.needs_review)}</Link> : 0}</td>
                    <td className="num">{fmtNum(p.active_listings)}</td>
                    <td className="num">{fmtNum(p.inactive_listings)}</td>
                    <td className="align-middle"><ShareBar mapped={p.mapped} review={p.needs_review} unmapped={p.unmapped} remapping={p.remapping} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="flex flex-wrap gap-x-4 gap-y-1 border-t border-line px-4 py-2 text-[12px] text-ink-3">
            {[["bg-mapped", "Mapped"], ["bg-oak-600", "Needs review"], ["bg-remap", "Re-mapping required"], ["bg-unmapped", "Unmapped"]].map(([cls, label]) => (
              <span key={label} className="inline-flex items-center gap-1.5"><span className={cn("size-2 rounded-[2px]", cls)} />{label}</span>
            ))}
          </p>
        </Panel>

        <Panel title={<>Unmapped SKUs <span className="tnum ml-1 text-unmapped">{fmtNum(c.unmapped + c.remapping)}</span></>} actions={<Link href="/unmapped" className="text-[12.5px] font-medium text-canopy-700 hover:underline">Resolve</Link>}>
          {pending.length === 0 ? <p className="text-[13px] text-ink-3">Add a platform to start.</p> : (
            <ul className="space-y-2.5">
              {pending.map((p) => {
                const n = p.unmapped + p.remapping;
                return (
                  <li key={p.id}>
                    <Link href={`/unmapped?platformId=${p.id}`} className="group block">
                      <span className="flex items-center justify-between text-[13px]">
                        <PlatformName name={p.platform_name} color={p.brand_color} logo={p.logo} />
                        <span className={cn("tnum font-medium", n === 0 && "text-ink-3")}>{fmtNum(n)}</span>
                      </span>
                      <span className="mt-1 block h-1.5 rounded-full bg-line-2"><span className="block h-full rounded-full bg-unmapped group-hover:opacity-80" style={{ width: n ? `${Math.max(2, (n / maxUnmapped) * 100)}%` : 0 }} /></span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>

      <div className={cn("mt-5 grid gap-5", data.activity && "xl:grid-cols-2")}>
        <Panel title="Recent imports" pad={false} actions={<Link href="/import" className="text-[12.5px] font-medium text-canopy-700 hover:underline">Import history</Link>}>
          {data.recentImports.length === 0 ? (
            <Empty title="No imports yet" action={can("import.run") ? <LinkButton href="/import" variant="primary">Import your first file</LinkButton> : undefined}>Upload an Amazon or Flipkart listing export to bring your Child SKUs in.</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead><tr><th>File</th><th>Platform</th><th className="num">Total</th><th className="num">Mapped</th><th className="num">Unmapped</th><th className="num">Review</th></tr></thead>
                <tbody>
                  {data.recentImports.map((i) => (
                    <tr key={i.id}>
                      <td className="max-w-[220px]">
                        <Link href={`/import/${i.id}`} className="block truncate font-medium text-canopy-700 hover:underline">{i.file_name}</Link>
                        <span className="text-[12px] text-ink-3">{fmtDateTime(i.created_at)}</span>
                      </td>
                      <td><PlatformName name={i.platform_name} color={i.platform_color} /></td>
                      <td className="num">{fmtNum(i.total_records)}</td><td className="num">{fmtNum(i.mapped_records)}</td>
                      <td className="num">{fmtNum(i.unmapped_records)}</td><td className="num">{fmtNum(i.review_records)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
        {data.activity && <Panel title="Recent activity" actions={<Link href="/audit" className="text-[12.5px] font-medium text-canopy-700 hover:underline">Audit log</Link>}>
          {data.activity.length === 0 ? <p className="text-[13px] text-ink-3">Nothing has happened yet.</p> : (
            <ul className="space-y-2.5">
              {data.activity.map((a) => (
                <li key={a.id} className="flex gap-3 text-[13px]">
                  <span className="w-[108px] shrink-0 text-[12px] text-ink-3">{fmtDateTime(a.created_at)}</span>
                  <span className="min-w-0"><span className="font-medium">{a.user_name ?? "System"}</span> {ACTION_TEXT[a.action] ?? a.action.toLowerCase().replace(/_/g, " ")} <span className="font-mono text-[12.5px]">{a.entity_label}</span>{a.platform_name && a.entity_type !== "platform" ? <span className="text-ink-3"> on {a.platform_name}</span> : null}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>}
      </div>
    </>
  );
}
