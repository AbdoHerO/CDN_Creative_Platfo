"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import { useSyncExternalStore, useTransition } from "react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { updatePreferencesAction } from "@/server/actions/preferences";

export function PreferencesForm({ showPreviewVersions, libraryView }: { showPreviewVersions: boolean; libraryView: "GRID" | "LIST" }) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  // The theme is only known on the client; avoid a hydration mismatch.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const [, startTransition] = useTransition();

  const save = (data: { showPreviewVersions?: boolean; libraryView?: "GRID" | "LIST" }) =>
    startTransition(async () => {
      const res = await updatePreferencesAction(data);
      if (!res.ok) toast.error(res.error);
      else toast.success("Preference saved.");
      router.refresh();
    });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Label>Theme</Label>
          <p className="text-sm text-muted-foreground">Light, dark, or follow your system setting.</p>
        </div>
        {mounted && (
          <ToggleGroup type="single" variant="outline" value={theme ?? "system"} onValueChange={(v) => v && setTheme(v)}>
            <ToggleGroupItem value="light" aria-label="Light">
              <Sun /> Light
            </ToggleGroupItem>
            <ToggleGroupItem value="dark" aria-label="Dark">
              <Moon /> Dark
            </ToggleGroupItem>
            <ToggleGroupItem value="system" aria-label="System">
              <Monitor /> System
            </ToggleGroupItem>
          </ToggleGroup>
        )}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Label>Default library view</Label>
          <p className="text-sm text-muted-foreground">How creatives are listed when you open the library.</p>
        </div>
        <ToggleGroup type="single" variant="outline" defaultValue={libraryView} onValueChange={(v) => v && save({ libraryView: v as "GRID" | "LIST" })}>
          <ToggleGroupItem value="GRID">Grid</ToggleGroupItem>
          <ToggleGroupItem value="LIST">List</ToggleGroupItem>
        </ToggleGroup>
      </div>
      <div className="flex items-center justify-between gap-4">
        <div>
          <Label htmlFor="pref-previews">Show preview versions in the library</Label>
          <p className="text-sm text-muted-foreground">
            Off by default: preview files stay inside their creative. When on, previews are listed as separate cards labelled PREVIEW.
          </p>
        </div>
        <Switch id="pref-previews" defaultChecked={showPreviewVersions} onCheckedChange={(v) => save({ showPreviewVersions: v })} />
      </div>
    </div>
  );
}
