import { logAudit } from "@/server/audit";
import { badRequest } from "@/server/errors";
import { api } from "@/server/http";
import { getSettings, saveSettings, type AppSettings } from "@/server/settings";

export const GET = api("view", async () => ({ settings: await getSettings() }));

export const PUT = api("settings.manage", async ({ body, user }) => {
  const patch = await body<Partial<AppSettings>>();
  for (const key of ["company", "matching", "masterSku", "permissions"] as const) {
    if (key in patch && (patch[key] === null || typeof patch[key] !== "object" || Array.isArray(patch[key]))) throw badRequest(`"${key}" must be an object.`);
  }
  if ("platformTypes" in patch && !Array.isArray(patch.platformTypes)) throw badRequest('"platformTypes" must be a list.');
  for (const key of Object.keys(patch)) if (!["company", "matching", "masterSku", "permissions", "platformTypes"].includes(key)) delete (patch as Record<string, unknown>)[key];
  if (patch.matching) {
    const a = Number(patch.matching.autoMapThreshold), r = Number(patch.matching.reviewThreshold);
    if (!(a >= 50 && a <= 100)) throw badRequest("Auto-map confidence must be between 50 and 100.");
    if (!(r >= 1 && r < a)) throw badRequest("Needs-review confidence must be at least 1 and lower than the auto-map confidence.");
    patch.matching = {
      autoMapThreshold: Math.round(a), reviewThreshold: Math.round(r),
      ignoreWords: (Array.isArray(patch.matching.ignoreWords) ? patch.matching.ignoreWords : []).map((w) => String(w).trim().toLowerCase()).filter(Boolean),
    };
  }
  if (patch.masterSku) {
    const prefix = String(patch.masterSku.prefix ?? "").trim().toUpperCase();
    if (!/^[A-Z0-9]{1,10}$/.test(prefix)) throw badRequest("Master SKU prefix must be 1–10 letters or numbers.");
    patch.masterSku = { prefix };
  }
  if (patch.platformTypes) {
    patch.platformTypes = patch.platformTypes.map((t) => String(t).trim()).filter(Boolean);
    if (!patch.platformTypes.length) throw badRequest("Keep at least one platform type.");
  }
  if (patch.company) patch.company = { name: String(patch.company.name ?? "").trim() || "Oakcraft Furniture", brand: String(patch.company.brand ?? "").trim() || "Oakcraft" };
  if (patch.permissions) {
    const p = patch.permissions;
    patch.permissions = { staffCanImport: !!p.staffCanImport, staffCanExport: !!p.staffCanExport, staffCanCreateMasters: !!p.staffCanCreateMasters, viewerCanExport: !!p.viewerCanExport };
  }
  const before = await getSettings();
  const settings = await saveSettings(patch, user.id);
  await logAudit({ user, action: "SETTINGS_UPDATED", entityType: "settings", entityLabel: Object.keys(patch).join(", "), oldValue: Object.fromEntries(Object.keys(patch).map((k) => [k, (before as unknown as Record<string, unknown>)[k]])), newValue: patch });
  return { settings };
});
