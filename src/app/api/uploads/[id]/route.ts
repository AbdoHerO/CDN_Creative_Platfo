import { apiError, apiUser, json } from "@/server/api-utils";
import { abortUpload, getUploadStatus } from "@/server/services/uploads";

/** Upload state, including parts already stored in R2 (for resuming). */
export async function GET(request: Request, ctx: RouteContext<"/api/uploads/[id]">) {
  try {
    const user = await apiUser(request);
    const { id } = await ctx.params;
    return json(await getUploadStatus(user, id));
  } catch (err) {
    return apiError(err);
  }
}

/** Cancel an upload: aborts the R2 multipart upload and discards stored parts. */
export async function DELETE(request: Request, ctx: RouteContext<"/api/uploads/[id]">) {
  try {
    const user = await apiUser(request, { mutating: true });
    const { id } = await ctx.params;
    return json(await abortUpload(user, id));
  } catch (err) {
    return apiError(err);
  }
}
