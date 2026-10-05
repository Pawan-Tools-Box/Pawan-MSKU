import { api, idParam } from "@/server/http";
import { restoreMaster } from "@/server/masters";

export const POST = api<{ id: string }>("master.delete", async ({ params, user }) => restoreMaster(idParam(params.id), user));
