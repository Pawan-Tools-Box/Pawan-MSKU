import { api, idParam } from "@/server/http";
import { addField, type FieldInput } from "@/server/platforms";

export const POST = api<{ id: string }>("platform.manage", async ({ params, body, user }) => ({
  field: await addField(idParam(params.id), await body<FieldInput>(), user),
}));
