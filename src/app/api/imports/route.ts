import { apiError, apiUser, json, readJson, requestMeta } from "@/server/api-utils";
import { importStartSchema, startImportUpload } from "@/server/services/uploads";

/** Start uploading a ZIP archive for import (analysed by the worker afterwards). */
export async function POST(request: Request) {
  try {
    const user = await apiUser(request, { permission: "import.create", mutating: true, rateLimit: { key: "import-start", limit: 10, windowSeconds: 60 } });
    return json(await startImportUpload(user, await readJson(request, importStartSchema), requestMeta(request)));
  } catch (err) {
    return apiError(err);
  }
}
