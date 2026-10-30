import { apiError, apiUser, json, readJson } from "@/server/api-utils";
import { planSchema, planUpload } from "@/server/services/uploads";

/** Validate files and suggest full/preview associations before uploading. */
export async function POST(request: Request) {
  try {
    const user = await apiUser(request, { permission: "creative.upload", mutating: true, rateLimit: { key: "upload-plan", limit: 120, windowSeconds: 60 } });
    return json(await planUpload(user, await readJson(request, planSchema)));
  } catch (err) {
    return apiError(err);
  }
}
