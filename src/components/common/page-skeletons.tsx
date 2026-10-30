import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Loading screens shown the moment a link is tapped (loading.tsx), while the
 * server renders the page. They follow the layout of the real pages so the
 * content slides in without jumping.
 */

function HeaderSkeleton() {
  return (
    <div className="mb-4 space-y-2 sm:mb-6">
      <Skeleton className="h-7 w-48 sm:h-8 sm:w-64" />
      <Skeleton className="h-4 w-full max-w-md" />
    </div>
  );
}

/** Generic page: title, a row of tiles and a list. */
export function PageSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading" data-testid="page-skeleton">
      <HeaderSkeleton />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className={cn("h-24 rounded-2xl sm:h-28 sm:rounded-xl", i === 4 && "max-md:hidden")} />
        ))}
      </div>
      <div className="space-y-px overflow-hidden rounded-xl border bg-card">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 p-4">
            <Skeleton className="size-9 shrink-0 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Library and the pages built on it (validation, approved, declined, archived). */
export function LibrarySkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading" data-testid="library-skeleton">
      <HeaderSkeleton />
      <div className="mb-5 space-y-3 rounded-2xl border bg-card p-3 sm:rounded-3xl sm:p-5">
        <div className="flex gap-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-8 w-24" />
          ))}
        </div>
        <div className="flex gap-2 overflow-hidden">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-9 w-32 shrink-0 rounded-full" />
          ))}
        </div>
      </div>
      <div className="mb-4 flex gap-2">
        <Skeleton className="h-9 flex-1 rounded-lg" />
        <Skeleton className="h-9 w-24 rounded-lg" />
      </div>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
        {Array.from({ length: 10 }, (_, i) => (
          <li key={i} className={cn(i >= 6 && "max-sm:hidden")}>
            <Skeleton className="aspect-[9/16] rounded-xl sm:rounded-2xl" />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Creative details: title, viewer and the metadata panel. */
export function CreativeSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading" data-testid="creative-skeleton">
      <div className="mb-4 space-y-2 sm:mb-6">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-7 w-64 max-w-full sm:h-8" />
        <div className="flex gap-1.5">
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <Skeleton className="aspect-video w-full rounded-2xl bg-neutral-900/15 dark:bg-neutral-100/10" />
          <div className="flex gap-2">
            <Skeleton className="h-9 w-40 rounded-lg" />
            <Skeleton className="h-9 w-32 rounded-lg" />
          </div>
        </div>
        <div className="space-y-3 rounded-xl border bg-card p-4">
          {Array.from({ length: 7 }, (_, i) => (
            <div key={i} className="flex justify-between gap-4">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-32" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
