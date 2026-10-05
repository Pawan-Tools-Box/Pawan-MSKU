import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { Shell } from "@/components/Shell";
import { SessionProvider } from "@/components/session";
import { FeedbackProvider } from "@/components/ui";
import { permissionsFor } from "@/server/auth";
import { navCounts } from "@/server/dashboard";
import { currentUser } from "@/server/http";
import { getSettings } from "@/server/settings";

export const dynamic = "force-dynamic";

/** Every screen inside the app requires a signed-in user; the check runs on the server. */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const settings = await getSettings();
  const initial = { user, permissions: permissionsFor(user, settings), counts: await navCounts(), company: settings.company };
  return (
    <SessionProvider initial={initial}>
      <FeedbackProvider>
        <Shell>{children}</Shell>
      </FeedbackProvider>
    </SessionProvider>
  );
}
