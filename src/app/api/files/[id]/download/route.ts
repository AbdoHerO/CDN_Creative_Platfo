import { NextResponse } from "next/server";
import { logActivity } from "@/lib/activity";
import { getEnv } from "@/lib/env";
import { signedGetUrl } from "@/lib/storage/r2";
import { VERSION_TYPE_LABELS } from "@/lib/constants";
import { apiError, apiUser, requestMeta } from "@/server/api-utils";
import { loadViewableFile } from "@/server/services/file-access";

/**
 * Download the original, byte-identical file. Authorisation is checked here;
 * the browser is then redirected to a short-lived presigned R2 URL that sets
 * the original filename.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/files/[id]/download">) {
  try {
    const user = await apiUser(request, { rateLimit: { key: "download", limit: 300, windowSeconds: 60 } });
    const { id } = await ctx.params;
    const file = await loadViewableFile(user, id);
    const url = await signedGetUrl(file.storageKey, {
      disposition: "attachment",
      filename: file.originalFilename,
      contentType: file.mimeType,
      expiresIn: getEnv().DOWNLOAD_URL_TTL_SECONDS,
    });
    await logActivity({
      actorId: user.id,
      action: "FILE_DOWNLOADED",
      entityType: "FILE",
      entityId: file.id,
      creativeId: file.creativeId,
      applicationId: file.creative.applicationId,
      summary: `${user.name} downloaded ${VERSION_TYPE_LABELS[file.versionType].toLowerCase()} v${file.versionNumber} of “${file.creative.name}” (${file.originalFilename})`,
      metadata: { sizeBytes: Number(file.sizeBytes) },
      meta: requestMeta(request),
    });
    return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return apiError(err);
  }
}
