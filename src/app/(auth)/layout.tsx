import { BrandMark, BrandName } from "@/components/brand";
import { prisma } from "@/lib/db";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const applications = await prisma.application
    .findMany({ where: { status: "ACTIVE" }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true, brandColor: true } })
    .catch(() => []);

  return (
    <div className="grid min-h-svh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <aside className="relative hidden flex-col justify-between overflow-hidden border-r bg-surface p-10 lg:flex">
        <div className="flex items-center gap-2.5">
          <BrandMark />
          <BrandName className="text-[15px]" />
        </div>
        <div className="max-w-md space-y-6">
          <h1 className="text-3xl font-semibold leading-tight tracking-tight text-balance">
            Every approved creative, one place to find it.
          </h1>
          <p className="text-muted-foreground leading-relaxed">
            Upload originals at full quality, link full and preview versions automatically, and move every asset through a
            clear validation workflow.
          </p>
          {applications.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {applications.map((app) => (
                <li key={app.id} className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-sm">
                  <span className="size-2 rounded-full" style={{ backgroundColor: app.brandColor }} />
                  {app.name}
                </li>
              ))}
            </ul>
          )}
        </div>
        <p className="text-xs text-muted-foreground">Internal tool · Access is restricted to authorised employees.</p>
      </aside>
      <main className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-sm">{children}</div>
      </main>
    </div>
  );
}
