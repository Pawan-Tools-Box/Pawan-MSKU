import { api, idParam } from "@/server/http";
import { removeField, updateField, type FieldInput } from "@/server/platforms";

export const PATCH = api<{ id: string; fieldId: string }>("platform.manage", async ({ params, body, user }) => ({
  field: await updateField(idParam(params.id), idParam(params.fieldId, "field id"), await body<Partial<FieldInput>>(), user),
}));

export const DELETE = api<{ id: string; fieldId: string }>("platform.manage", async ({ params, user }) => {
  await removeField(idParam(params.id), idParam(params.fieldId, "field id"), user);
  return { ok: true };
});
