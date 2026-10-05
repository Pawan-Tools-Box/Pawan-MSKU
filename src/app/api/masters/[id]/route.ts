import { api, idParam } from "@/server/http";
import { deleteMaster, getMaster, updateMaster, type MasterInput } from "@/server/masters";

export const GET = api<{ id: string }>("view", async ({ params }) => getMaster(idParam(params.id)));

export const PATCH = api<{ id: string }>("master.write", async ({ params, body, user }) => updateMaster(idParam(params.id), await body<MasterInput>(), user));

export const DELETE = api<{ id: string }>("master.delete", async ({ params, user }) => deleteMaster(idParam(params.id), user));
