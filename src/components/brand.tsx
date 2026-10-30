import { cn } from "@/lib/utils";

export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm",
        className,
      )}
      aria-hidden
    >
      <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
        <rect x="3.5" y="3.5" width="7" height="7" rx="1.6" />
        <rect x="13.5" y="3.5" width="7" height="7" rx="1.6" opacity="0.55" />
        <rect x="3.5" y="13.5" width="7" height="7" rx="1.6" opacity="0.55" />
        <path d="M14.5 14.2v5.6l4.6-2.8z" fill="currentColor" stroke="none" />
      </svg>
    </span>
  );
}

export function BrandName({ className }: { className?: string }) {
  return <span className={cn("font-semibold tracking-tight", className)}>Creative Hub</span>;
}
