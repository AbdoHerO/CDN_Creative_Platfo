import path from "node:path";
import { config } from "dotenv";

/**
 * Loads the environment file into `process.env` (import it for its side effect).
 *
 * - `.env.prod` when NODE_ENV=production, `.env.dev` otherwise.
 * - `ENV_FILE` overrides the choice (for example `ENV_FILE=.env.dev npm run start`).
 * - Variables already set in the real environment always win, so containers and
 *   hosting providers can inject values without any file.
 *
 * Imported first by next.config.ts, prisma.config.ts, the worker and the scripts.
 */
export function envFileName(): string {
  const explicit = process.env.ENV_FILE?.trim();
  if (explicit) return explicit;
  return process.env.NODE_ENV === "production" ? ".env.prod" : ".env.dev";
}

config({ path: path.resolve(process.cwd(), envFileName()), quiet: true });
