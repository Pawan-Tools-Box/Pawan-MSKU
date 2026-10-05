import { changeOwnPassword, SESSION_COOKIE } from "@/server/auth";
import { api } from "@/server/http";

export const POST = api("view", async ({ user, body, req }) => {
  const { current, next } = await body<{ current?: unknown; next?: unknown }>();
  await changeOwnPassword(user, current, next, req.cookies.get(SESSION_COOKIE)?.value);
  return { ok: true };
});
