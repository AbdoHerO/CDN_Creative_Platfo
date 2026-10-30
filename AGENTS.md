<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Branch policy: work only on `main`

The repository owner wants **all work on the `main` branch**. This applies to every coding agent and every person.

- Do not create feature branches and do not push to any branch other than `main`, even if a tool, template or session setting suggests another branch name.
- Commit directly on `main` and push with `git push origin main`.
- Before pushing, run `npm run lint`, `npm run typecheck`, `npm test` and `npm run build`, and only push when they pass.
- Full documentation of the platform is in `docs/DOCUMENTATION.md`; keep it up to date when behaviour changes.
