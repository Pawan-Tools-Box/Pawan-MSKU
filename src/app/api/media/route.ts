import { badRequest } from "@/server/errors";
import { api, uploadedFile } from "@/server/http";
import { saveImage } from "@/server/media";

export const POST = api("view", async ({ req, user, can }) => {
  if (!can("master.write") && !can("platform.manage")) throw badRequest("You do not have permission to upload images.");
  const { file, buffer } = await uploadedFile(req, 3, "Choose an image to upload.");
  return saveImage(file.name, buffer, user);
});
