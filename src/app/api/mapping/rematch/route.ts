import { api } from "@/server/http";
import { rematchPending } from "@/server/listings";

export const POST = api("mapping.write", async ({ body, user }) => {
  const { platformId } = await body<{ platformId?: number }>();
  return rematchPending(user, platformId ? Number(platformId) : undefined);
});
