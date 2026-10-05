import { badRequest } from "@/server/errors";
import { api, boolQ, intQ, uploadedFile } from "@/server/http";
import { createImport, listImports } from "@/server/imports";

export const GET = api("view", async ({ url }) =>
  listImports({ platformId: intQ(url, "platformId"), page: intQ(url, "page"), pageSize: intQ(url, "pageSize"), all: boolQ(url, "all") })
);

export const POST = api("import.run", async ({ req, user }) => {
  const { file, form, buffer } = await uploadedFile(req, Number(process.env.MAX_UPLOAD_MB || 30), "Choose an Excel or CSV file to upload.");
  const platformId = Number(form.get("platformId"));
  if (!Number.isInteger(platformId) || platformId <= 0) throw badRequest("Please select a valid platform.");
  return createImport(platformId, file.name, buffer, file.type || null, user);
});
