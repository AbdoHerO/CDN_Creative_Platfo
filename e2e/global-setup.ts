import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const FIXTURES = join(__dirname, ".fixtures");

/** Generate real media fixtures with ffmpeg (a full video, its _preview, and an image). */
export default function globalSetup() {
  mkdirSync(FIXTURES, { recursive: true });
  const ffmpeg = process.env.FFMPEG_PATH ?? "ffmpeg";
  const make = (name: string, args: string[]) => {
    const out = join(FIXTURES, name);
    if (!existsSync(out)) execFileSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", ...args, out]);
  };
  make("e2e_spot.mp4", ["-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=25", "-t", "3", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p"]);
  make("e2e_spot_preview.mp4", ["-f", "lavfi", "-i", "testsrc2=size=320x180:rate=25", "-t", "3", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p"]);
  make("e2e_banner.png", ["-f", "lavfi", "-i", "gradients=size=1200x628:duration=1", "-frames:v", "1"]);
  writeFileSync(join(FIXTURES, "fake_clip.mp4"), Buffer.from("this is plain text, not a video"));
}
