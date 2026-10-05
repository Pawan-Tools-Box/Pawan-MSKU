import { NextResponse } from "next/server";
import { login, SESSION_COOKIE } from "@/server/auth";
import { api, cookieSecure } from "@/server/http";

export const POST = api("public", async ({ body, ip, req }) => {
  const { email, password } = await body<{ email?: unknown; password?: unknown }>();
  const { token, expires, user } = await login(email, password, { ip, userAgent: req.headers.get("user-agent") });
  const res = NextResponse.json({ user });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true, sameSite: "lax", secure: cookieSecure(req), path: "/", expires,
  });
  return res;
});
