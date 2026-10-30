import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Deterministic soft colour per user so avatars are recognisable without uploads. */
const TONES = [
  "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-200",
  "bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-200",
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200",
  "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200",
  "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-200",
  "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-200",
  "bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-200",
];

function toneFor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return TONES[Math.abs(hash) % TONES.length];
}

export function UserAvatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex size-7 shrink-0 select-none items-center justify-center rounded-full text-[11px] font-semibold",
        toneFor(name),
        className,
      )}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}
