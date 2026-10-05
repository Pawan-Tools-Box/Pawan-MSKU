import { updateUser } from "@/server/auth";
import { api, idParam } from "@/server/http";
import type { Role } from "@/server/types";

export const PATCH = api<{ id: string }>("users.manage", async ({ params, body, user }) => ({
  user: await updateUser(idParam(params.id), await body<{ name?: string; role?: Role; status?: "ACTIVE" | "INACTIVE"; password?: string }>(), user),
}));
