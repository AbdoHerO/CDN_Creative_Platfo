"use client";

import { X } from "lucide-react";
import { useId, useState } from "react";
import { cn } from "@/lib/utils";

/** Free-text tag entry with suggestions (Enter or comma to add). */
export function TagInput({
  value,
  onChange,
  suggestions = [],
  placeholder = "Add tag…",
  id,
  max = 30,
  className,
}: {
  value: string[];
  onChange: (tags: string[]) => void;
  suggestions?: string[];
  placeholder?: string;
  id?: string;
  max?: number;
  className?: string;
}) {
  const [draft, setDraft] = useState("");
  const listId = useId();

  const add = (raw: string) => {
    const parts = raw
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
    if (!parts.length) return;
    const next = [...value];
    for (const p of parts) if (!next.includes(p) && next.length < max) next.push(p.slice(0, 40));
    onChange(next);
    setDraft("");
  };

  return (
    <div
      className={cn(
        "flex min-h-9 w-full flex-wrap items-center gap-1.5 rounded-lg border border-input bg-transparent px-2 py-1.5 text-sm shadow-xs focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30",
        className,
      )}
    >
      {value.map((tag) => (
        <span key={tag} className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-0.5 text-xs font-medium">
          {tag}
          <button type="button" onClick={() => onChange(value.filter((t) => t !== tag))} aria-label={`Remove tag ${tag}`} className="text-muted-foreground hover:text-foreground">
            <X className="size-3" />
          </button>
        </span>
      ))}
      <input
        id={id}
        list={listId}
        value={draft}
        onChange={(e) => {
          if (e.target.value.endsWith(",")) add(e.target.value);
          else setDraft(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add(draft);
          } else if (e.key === "Backspace" && !draft && value.length) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={() => add(draft)}
        placeholder={value.length ? "" : placeholder}
        className="min-w-24 flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
      />
      <datalist id={listId}>
        {suggestions
          .filter((s) => !value.includes(s))
          .slice(0, 200)
          .map((s) => (
            <option key={s} value={s} />
          ))}
      </datalist>
    </div>
  );
}
