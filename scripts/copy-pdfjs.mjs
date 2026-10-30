/**
 * Copy the pdf.js runtime assets (worker, CMaps, standard fonts, wasm decoders,
 * ICC profiles) to public/pdfjs so the PDF reader loads them from our own
 * origin. Runs before `next dev` and `next build`; the folder is git-ignored and
 * always matches the installed pdfjs-dist version.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const pkgDir = dirname(require.resolve("pdfjs-dist/package.json"));
const { version } = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));
const out = join(process.cwd(), "public", "pdfjs");
const stamp = join(out, "VERSION");

if (existsSync(stamp) && readFileSync(stamp, "utf8").trim() === version) process.exit(0);

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(join(pkgDir, "build", "pdf.worker.min.mjs"), join(out, "pdf.worker.min.mjs"));
for (const dir of ["cmaps", "standard_fonts", "wasm", "iccs"]) cpSync(join(pkgDir, dir), join(out, dir), { recursive: true });
writeFileSync(stamp, `${version}\n`);
console.log(`pdf.js ${version} assets copied to public/pdfjs`);
