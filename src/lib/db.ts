import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

/**
 * Single Prisma client per process. In development the instance is kept on
 * globalThis so hot reloads do not exhaust database connections.
 */

const globalForPrisma = globalThis as unknown as { __cmpPrisma?: PrismaClient };

function createClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  const adapter = new PrismaPg({ connectionString, max: Number(process.env.DATABASE_POOL_SIZE ?? 10) });
  return new PrismaClient({
    adapter,
    log: process.env.PRISMA_LOG_QUERIES === "true" ? ["query", "warn", "error"] : ["warn", "error"],
  });
}

function getClient(): PrismaClient {
  if (!globalForPrisma.__cmpPrisma) {
    globalForPrisma.__cmpPrisma = createClient();
  }
  return globalForPrisma.__cmpPrisma;
}

/**
 * Lazily-initialised client so importing this module never requires a database
 * connection string (e.g. during `next build`).
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getClient();
    const value = Reflect.get(client, prop);
    return typeof value === "function" ? value.bind(client) : value;
  },
});

export type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];
export type Db = PrismaClient | Tx;
