import { NextResponse } from "next/server";
import { logout, SESSION_COOKIE } from "@/server/auth";
import { logAudit } from "@/server/audit";
import { api } from "@/server/http";

export const POST = api("view", async ({ req, user, ip }) => {
  await logout(req.cookies.get(SESSION_COOKIE)?.value);
  await logAudit({ user, action: "LOGOUT", entityType: "session", entityId: user.id, entityLabel: user.email, ip });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  return res;
});
