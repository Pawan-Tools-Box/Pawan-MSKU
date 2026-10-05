import { api, idParam } from "@/server/http";
import { getPlatform, updatePlatform, type PlatformInput } from "@/server/platforms";

export const GET = api<{ id: string }>("view", async ({ params }) => ({ platform: await getPlatform(idParam(params.id)) }));

export const PATCH = api<{ id: string }>("platform.manage", async ({ params, body, user }) => ({
  platform: await updatePlatform(idParam(params.id), await body<PlatformInput>(), user),
}));
