import { dashboard } from "@/server/dashboard";
import { api } from "@/server/http";

export const GET = api("view", async ({ can }) => dashboard(can("audit.view")));
