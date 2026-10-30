import { NextResponse } from "next/server";
import { signedGetUrl } from "@/lib/storage/s3";
import { apiError, apiUser } from "@/server/api-utils";
import { loadViewableFile } from "@/server/services/file-access";

/** Open the original inline in a new tab (browser-native viewer). */
export async function GET(request: Request, ctx: RouteContext<"/api/files/[id]/preview">) {
  try {
    const user = await apiUser(request);
    const { id } = await ctx.params;
    const file = await loadViewableFile(user, id);
    const url = await signedGetUrl(file.storageKey, { disposition: "inline", filename: file.originalFilename, contentType: file.mimeType });
    return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return apiError(err);
  }
}
