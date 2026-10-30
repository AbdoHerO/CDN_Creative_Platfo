import { brandInitials } from "@/lib/format";
import { cn } from "@/lib/utils";

export function AppBadge({
  name,
  color,
  className,
  size = "sm",
}: {
  name: string;
  color: string;
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <span
      className={cn(
        "inline-flex min-w-0 items-center gap-1.5 text-muted-foreground",
        size === "sm" ? "text-xs" : "text-sm",
        className,
      )}
    >
      <span className={cn("shrink-0 rounded-full", size === "sm" ? "size-2" : "size-2.5")} style={{ backgroundColor: color }} />
      <span className="truncate">{name}</span>
    </span>
  );
}

export function AppLogo({
  name,
  color,
  logoUrl,
  className,
}: {
  name: string;
  color: string;
  logoUrl?: string | null;
  className?: string;
}) {
  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={logoUrl} alt={`${name} logo`} className={cn("size-10 shrink-0 rounded-lg border bg-card object-contain p-1", className)} />
    );
  }
  return (
    <span
      className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg text-sm font-semibold text-white shadow-sm", className)}
      style={{ backgroundColor: color }}
      aria-hidden
    >
      {brandInitials(name)}
    </span>
  );
}
