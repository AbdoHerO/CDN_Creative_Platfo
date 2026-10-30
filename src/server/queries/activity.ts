import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { ActivityAction, EntityType } from "@/generated/prisma/enums";

export type ActivityParams = {
  q?: string;
  user?: string;
  action?: ActivityAction;
  entity?: EntityType;
  app?: string;
  from?: string;
  to?: string;
  page: number;
};

const ID = /^[a-z0-9]{10,40}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function parseActivityParams(sp: Record<string, string | string[] | undefined>): ActivityParams {
  const get = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const action = get("action");
  const entity = get("entity");
  return {
    q: get("q")?.trim().slice(0, 200) || undefined,
    user: get("user") && ID.test(get("user")!) ? get("user") : undefined,
    action: action && action in ActivityAction ? (action as ActivityAction) : undefined,
    entity: entity && entity in EntityType ? (entity as EntityType) : undefined,
    app: get("app") && ID.test(get("app")!) ? get("app") : undefined,
    from: get("from") && DATE.test(get("from")!) ? get("from") : undefined,
    to: get("to") && DATE.test(get("to")!) ? get("to") : undefined,
    page: Math.max(1, Math.min(10_000, Number.parseInt(get("page") ?? "1", 10) || 1)),
  };
}

export function activityWhere(p: ActivityParams): Prisma.ActivityLogWhereInput {
  const and: Prisma.ActivityLogWhereInput[] = [];
  if (p.q) {
    and.push({
      OR: [
        { summary: { contains: p.q, mode: "insensitive" } },
        { actor: { name: { contains: p.q, mode: "insensitive" } } },
        { actor: { email: { contains: p.q, mode: "insensitive" } } },
      ],
    });
  }
  if (p.user) and.push({ actorId: p.user });
  if (p.action) and.push({ action: p.action });
  if (p.entity) and.push({ entityType: p.entity });
  if (p.app) and.push({ applicationId: p.app });
  if (p.from) and.push({ createdAt: { gte: new Date(`${p.from}T00:00:00.000Z`) } });
  if (p.to) and.push({ createdAt: { lt: new Date(new Date(`${p.to}T00:00:00.000Z`).getTime() + 86_400_000) } });
  return { AND: and };
}
