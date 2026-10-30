import { type NextRequest } from "next/server";
import { ZipFile } from "yazl";
import { prisma } from "@/lib/db";
import { applicationScope } from "@/lib/visibility";
import { apiError, apiUser } from "@/server/api-utils";

/** Folder name for a platform in the template: its name, lower-cased, safe on every OS. */
function folderName(name: string) {
  return name.trim().toLowerCase().replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "-").replace(/[. ]+$/, "") || "platform";
}

function readme(folders: string[]) {
  return [
    "CREATIVE HUB - IMPORT TEMPLATE",
    "==============================",
    "",
    "1. Put each file in the folder of its platform:",
    "     <platform>/videos/   videos",
    "     <platform>/banners/  banners and images (category: Banner)",
    "     <platform>/pdf/      PDF documents: guides, storyboards... (category: Document)",
    "",
    `   Platforms in this template: ${folders.join(", ")}`,
    "   A new folder name creates a new platform when the import is confirmed (administrators).",
    "",
    "2. Lite versions: add the word \"preview\" to the file name of the light copy of a video.",
    "     spot.mp4  +  spot_preview.mp4   (also spot-preview.mp4)",
    "   Both files become one creative: the full version and its preview.",
    "",
    "3. Zip the data_creatives folder and import it from Upload > ZIP import.",
    "   Every import adds new creatives. A name that already exists gets (2), (3)...",
    "",
    "This README file is ignored by the import.",
    "",
  ].join("\r\n");
}

/** ZIP skeleton of the import structure, with one folder per platform the user can upload to. */
export async function GET(request: NextRequest) {
  try {
    const user = await apiUser(request, { permission: "import.create" });
    const apps = await prisma.application.findMany({
      where: { AND: [applicationScope(user), { status: "ACTIVE" }] },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { name: true },
    });
    const folders = [...new Set(apps.map((a) => folderName(a.name)))];

    const zip = new ZipFile();
    const root = "data_creatives";
    zip.addBuffer(Buffer.from(readme(folders), "utf8"), `${root}/README.txt`);
    for (const folder of folders) {
      zip.addEmptyDirectory(`${root}/${folder}/banners`);
      zip.addEmptyDirectory(`${root}/${folder}/videos`);
      zip.addEmptyDirectory(`${root}/${folder}/pdf`);
    }
    zip.end();
    const chunks: Buffer[] = [];
    for await (const chunk of zip.outputStream) chunks.push(chunk as Buffer);

    return new Response(new Uint8Array(Buffer.concat(chunks)), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": 'attachment; filename="data_creatives-template.zip"',
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return apiError(err);
  }
}
