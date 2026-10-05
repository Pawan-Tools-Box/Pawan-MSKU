import { api, idParam } from "@/server/http";
import { getImport } from "@/server/imports";

export const GET = api<{ id: string }>("view", async ({ params }) => ({ import: await getImport(idParam(params.id)) }));
