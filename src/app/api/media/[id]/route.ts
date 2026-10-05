import { api, idParam } from "@/server/http";
import { getImage } from "@/server/media";

export const GET = api<{ id: string }>("view", async ({ params }) => {
  const img = await getImage(idParam(params.id));
  return new Response(new Uint8Array(img.data), {
    headers: { "Content-Type": img.mime_type, "Cache-Control": "private, max-age=86400", "Content-Security-Policy": "default-src 'none'", "X-Content-Type-Options": "nosniff" },
  });
});
