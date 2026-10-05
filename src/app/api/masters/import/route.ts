import { api, uploadedFile } from "@/server/http";
import { importMasters } from "@/server/masters";

export const POST = api("master.write", async ({ req, user }) => {
  const { file, form, buffer } = await uploadedFile(req, 20, "Choose an Excel or CSV file.");
  return importMasters(buffer, file.name, user, form.get("dryRun") === "1");
});
