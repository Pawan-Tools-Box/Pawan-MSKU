"use client";
import Link from "next/link";
import { Download } from "lucide-react";
import { useApi } from "@/components/api";
import { useSession } from "@/components/session";
import { ErrorNote, PageHeader, Spinner } from "@/components/ui";
import type { ReportMeta } from "@/server/reports";

const GROUPS: ReportMeta["group"][] = ["Master SKUs", "Listings", "Mapping", "Platforms", "History"];

export default function ReportsPage() {
  const { can } = useSession();
  const { data, loading, error } = useApi<{ reports: ReportMeta[] }>("/api/reports");
  if (loading && !data) return <Spinner />;
  if (error || !data) return <ErrorNote>{error}</ErrorNote>;
  return (
    <>
      <PageHeader title="Reports" description="Open a report to view it on screen, or download it as Excel or CSV. Platform reports are created automatically for every platform you add." />
      <div className="space-y-6">
        {GROUPS.map((g) => {
          const items = data.reports.filter((r) => r.group === g);
          if (!items.length) return null;
          return (
            <section key={g}>
              <h2 className="mb-2 text-[13px] font-semibold text-ink-2">{g}</h2>
              <ul className="divide-y divide-line-2 overflow-hidden rounded-lg border border-line bg-card">
                {items.map((r) => (
                  <li key={r.key} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-[#fafbf9]">
                    <div className="min-w-0 flex-1">
                      <Link href={`/reports/${r.key}`} className="text-[14px] font-medium text-canopy-800 hover:underline">{r.title}</Link>
                      <p className="text-[12.5px] text-ink-3">{r.description}</p>
                    </div>
                    {can("export.run") && (
                      <span className="flex items-center gap-3 text-[12.5px] font-medium text-canopy-700">
                        <a href={`/api/reports/${r.key}?format=xlsx`} className="inline-flex items-center gap-1 hover:underline"><Download className="size-3.5" />Excel</a>
                        <a href={`/api/reports/${r.key}?format=csv`} className="hover:underline">CSV</a>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </>
  );
}
