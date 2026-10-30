"use client";

import { Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CHANNEL_LABELS, CHANNEL_ORDER } from "@/lib/constants";
import type { Channel } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";

export function ChannelPicker({ value, onChange, id }: { value: Channel[]; onChange: (v: Channel[]) => void; id?: string }) {
  const toggle = (c: Channel) => onChange(value.includes(c) ? value.filter((v) => v !== c) : [...value, c]);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button id={id} type="button" variant="outline" className="h-9 w-full justify-between font-normal">
          <span className={cn("truncate", !value.length && "text-muted-foreground")}>
            {value.length ? value.map((v) => CHANNEL_LABELS[v]).join(", ") : "Select platforms…"}
          </span>
          <ChevronDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-1" align="start">
        <ul className="max-h-72 overflow-y-auto">
          {CHANNEL_ORDER.map((c) => (
            <li key={c}>
              <button
                type="button"
                onClick={() => toggle(c)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
              >
                <span className={cn("flex size-4 items-center justify-center rounded border", value.includes(c) && "border-primary bg-primary text-primary-foreground")}>
                  {value.includes(c) && <Check className="size-3" />}
                </span>
                {CHANNEL_LABELS[c]}
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
