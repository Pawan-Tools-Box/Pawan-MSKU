import { permissionsFor } from "@/server/auth";
import { navCounts } from "@/server/dashboard";
import { api } from "@/server/http";

export const GET = api("view", async ({ user, settings }) => ({
  user,
  permissions: permissionsFor(user, settings),
  counts: await navCounts(),
  company: settings.company,
}));
