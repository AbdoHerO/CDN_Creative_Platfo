import "server-only";
import type { SessionUser } from "@/lib/auth/session-core";
import { prisma } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { canViewCreative } from "@/lib/permissions";

/** Load a file the user is allowed to see (404 otherwise, to avoid leaking existence). */
export async function loadViewableFile(user: SessionUser, fileId: string) {
  const file = await prisma.creativeFile.findUnique({
    where: { id: fileId },
    include: { creative: { select: { id: true, name: true, status: true, applicationId: true, createdById: true } } },
  });
  if (!file || !canViewCreative(user, file.creative)) throw new NotFoundError("File not found.");
  return file;
}
