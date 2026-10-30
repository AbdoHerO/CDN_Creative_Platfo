/**
 * First-run bootstrap: `npm run db:bootstrap`. The production container runs it
 * on every start, right after `prisma migrate deploy`. It creates the roles,
 * the first admin (from SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD / SEED_ADMIN_NAME)
 * when no admin exists, and the initial platforms and badges on an empty
 * database. Existing data is never changed (see src/server/services/bootstrap.ts).
 */
import "../src/lib/load-env";
import { prisma } from "../src/lib/db";
import { bootstrap } from "../src/server/services/bootstrap";

bootstrap(prisma, {
  email: process.env.SEED_ADMIN_EMAIL,
  password: process.env.SEED_ADMIN_PASSWORD,
  name: process.env.SEED_ADMIN_NAME,
})
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
