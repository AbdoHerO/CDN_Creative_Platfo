import { z } from "zod";
import { apiError, apiUser, json, readJson } from "@/server/api-utils";
import { presignParts } from "@/server/services/uploads";

const schema = z.object({ partNumbers: z.array(z.number().int().min(1).max(10_000)).min(1).max(100) });

/** Presign URLs for the next parts of a multipart upload. */
export async function POST(request: Request, ctx: RouteContext<"/api/uploads/[id]/parts">) {
  try {
    const user = await apiUser(request, { mutating: true, rateLimit: { key: "upload-parts", limit: 1200, windowSeconds: 60 } });
    const { id } = await ctx.params;
    const { partNumbers } = await readJson(request, schema);
    return json(await presignParts(user, id, partNumbers));
  } catch (err) {
    return apiError(err);
  }
}
