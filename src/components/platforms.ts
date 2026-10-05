"use client";
import { useApi } from "./api";
import type { PlatformWithCounts } from "@/server/platforms";
import type { PlatformField } from "@/server/types";

export type PlatformFull = PlatformWithCounts & { fields: PlatformField[] };

/** All non-archived platforms with their custom fields. Everything platform-specific in the UI is driven by this. */
export function usePlatforms() {
  const { data, loading, reload, error } = useApi<{ platforms: PlatformFull[] }>("/api/platforms?fields=1");
  return { platforms: data?.platforms ?? [], loading, reload, error };
}
