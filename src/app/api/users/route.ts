import { createUser, listUsers } from "@/server/auth";
import { api } from "@/server/http";
import type { Role } from "@/server/types";

export const GET = api("users.manage", async () => ({ users: await listUsers() }));

export const POST = api("users.manage", async ({ body, user }) => ({
  user: await createUser(await body<{ name: string; email: string; password: string; role: Role }>(), user),
}));
