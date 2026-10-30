"use client";

import { FileArchive, Files } from "lucide-react";
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UploadWorkspace, type UploadContext } from "./upload-workspace";
import { ZipImportForm } from "./zip-import-form";

export function UploadTabs(props: UploadContext & { disabled: boolean; initialTab: "files" | "zip" }) {
  const [tab, setTab] = useState(props.initialTab);
  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as "files" | "zip")} className="gap-5">
      <TabsList>
        <TabsTrigger value="files">
          <Files /> Files
        </TabsTrigger>
        <TabsTrigger value="zip">
          <FileArchive /> ZIP import
        </TabsTrigger>
      </TabsList>
      <TabsContent value="files">
        <UploadWorkspace {...props} />
      </TabsContent>
      <TabsContent value="zip">
        <ZipImportForm {...props} />
      </TabsContent>
    </Tabs>
  );
}
