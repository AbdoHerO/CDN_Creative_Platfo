"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

const ALL = "__all";

/** Update library filters in the URL (state lives in the URL so views are shareable). */
export function useLibraryUrl() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const update = (patch: Record<string, string | null | undefined>) => {
    const sp = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) continue;
      if (!value || value === ALL) sp.delete(key);
      else sp.set(key, value);
    }
    if (patch.app !== undefined && patch.app !== searchParams.get("app")) sp.delete("campaign");
    sp.delete("page");
    const qs = sp.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  };

  return { update, pending, searchParams };
}
