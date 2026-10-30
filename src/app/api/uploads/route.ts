import { apiError, apiUser, json, readJson } from "@/server/api-utils";
import { batchSchema, createUploadBatch, listResumableUploads } from "@/server/services/uploads";

/** Interrupted uploads that can be resumed by re-selecting the same file. */
export async function GET(request: Request) {
  try {
    const user = await apiUser(request, { permission: "creative.upload" });
    return json({ uploads: await listResumableUploads(user) });
  } catch (err) {
    return apiError(err);
  }
}

/** Create creatives + upload sessions for a confirmed batch. */
export async function POST(request: Request) {
  try {
    const user = await apiUser(request, { permission: "creative.upload", mutating: true, rateLimit: { key: "upload-batch", limit: 30, windowSeconds: 60 } });
    return json({ sessions: await createUploadBatch(user, await readJson(request, batchSchema)) });
  } catch (err) {
    return apiError(err);
  }
}
