import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isStorageConfigured } from "@/lib/env";

/** Liveness/readiness probe for load balancers. Does not expose secrets. */
export async function GET() {
  let database = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    database = true;
  } catch {
    database = false;
  }
  const body = { status: database ? "ok" : "degraded", database, storageConfigured: isStorageConfigured() };
  return NextResponse.json(body, { status: database ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
