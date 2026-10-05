import { api, boolQ } from "@/server/http";
import { createPlatform, getAllFields, listPlatforms } from "@/server/platforms";

export const GET = api("view", async ({ url }) => {
  const platforms = await listPlatforms({ includeArchived: boolQ(url, "all"), activeOnly: boolQ(url, "active") });
  if (!boolQ(url, "fields")) return { platforms };
  const fields = await getAllFields();
  return { platforms: platforms.map((p) => ({ ...p, fields: fields.filter((f) => f.platform_id === p.id) })) };
});

export const POST = api("platform.manage", async ({ body, user }) => {
  const data = await body<Parameters<typeof createPlatform>[0]>();
  return { platform: await createPlatform(data, user) };
});
