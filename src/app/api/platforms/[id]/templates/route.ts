import { api, idParam } from "@/server/http";
import { deleteTemplate, getTemplates, saveTemplate } from "@/server/platforms";

export const GET = api<{ id: string }>("view", async ({ params }) => ({ templates: await getTemplates(idParam(params.id)) }));

export const POST = api<{ id: string }>("import.run", async ({ params, body, user }) => {
  const t = await body<{ template_name?: string; sheet_name?: string | null; header_row: number; data_start_row: number; column_map: Record<string, string> }>();
  return { template: await saveTemplate(idParam(params.id), { ...t, header_row: Number(t.header_row), data_start_row: Number(t.data_start_row) }, user) };
});

export const DELETE = api<{ id: string }>("platform.manage", async ({ params, url, user }) => {
  await deleteTemplate(idParam(params.id), idParam(url.searchParams.get("templateId") ?? "", "template id"), user);
  return { ok: true };
});
