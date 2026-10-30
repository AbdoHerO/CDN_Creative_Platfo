import { apiError, apiUser, json, readJson, requestMeta } from "@/server/api-utils";
import { completeSchema, completeUpload } from "@/server/services/uploads";

/** Finalise an upload: verify the stored object and register it as a version. */
export async function POST(request: Request, ctx: RouteContext<"/api/uploads/[id]/complete">) {
  try {
    const user = await apiUser(request, { mutating: true });
    const { id } = await ctx.params;
    return json(await completeUpload(user, id, await readJson(request, completeSchema), requestMeta(request)));
  } catch (err) {
    return apiError(err);
  }
}
