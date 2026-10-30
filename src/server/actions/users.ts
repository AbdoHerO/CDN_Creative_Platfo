"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { RoleKey } from "@/generated/prisma/enums";
import { logActivity } from "@/lib/activity";
import { getRequestMeta, requireActionUser } from "@/lib/auth/current-user";
import { generateTemporaryPassword, hashPassword } from "@/lib/auth/password";
import { invalidateUserSessions } from "@/lib/auth/session-core";
import { ROLE_LABELS } from "@/lib/constants";
import { prisma } from "@/lib/db";
import { AppError, NotFoundError } from "@/lib/errors";
import { parseInput, runAction } from "@/server/action-utils";

const baseSchema = z.object({
  name: z.string().trim().min(2, "Name is required.").max(100),
  jobTitle: z.string().trim().max(100).nullish(),
  role: z.enum(RoleKey),
  restrictApplications: z.boolean(),
  applicationIds: z.array(z.string().min(1).max(64)).max(200),
});

const createSchema = baseSchema.extend({ email: z.string().trim().toLowerCase().email("Enter a valid email.") });

async function roleId(key: RoleKey) {
  const role = await prisma.role.findUnique({ where: { key } });
  if (!role) throw new AppError("Roles are not seeded. Run the database seed.", 500);
  return role.id;
}

async function assertNotLastAdmin(userId: string) {
  const admins = await prisma.user.count({ where: { status: "ACTIVE", role: { key: "ADMIN" }, id: { not: userId } } });
  if (admins === 0) throw new AppError("At least one active administrator is required.", 409);
}

function revalidateTeam() {
  revalidatePath("/team");
}

export async function createUserAction(input: z.input<typeof createSchema>) {
  return runAction(async () => {
    const admin = await requireActionUser("user.manage");
    const data = parseInput(createSchema, input);
    if (data.restrictApplications && data.applicationIds.length === 0) {
      throw new AppError("Select at least one application or allow all applications.", 422, { applicationIds: "Select at least one application." });
    }
    if (await prisma.user.findUnique({ where: { email: data.email } })) {
      throw new AppError("A user with this email already exists.", 409, { email: "Email already in use." });
    }
    const temporaryPassword = generateTemporaryPassword();
    const user = await prisma.user.create({
      data: {
        email: data.email,
        name: data.name,
        jobTitle: data.jobTitle || null,
        roleId: await roleId(data.role),
        passwordHash: await hashPassword(temporaryPassword),
        mustChangePassword: true,
        restrictApplications: data.restrictApplications,
        applicationAccess: data.restrictApplications ? { create: data.applicationIds.map((applicationId) => ({ applicationId })) } : undefined,
      },
    });
    await logActivity({
      actorId: admin.id,
      action: "USER_CREATED",
      entityType: "USER",
      entityId: user.id,
      summary: `${admin.name} created ${data.role.toLowerCase()} account ${data.email}`,
      meta: await getRequestMeta(),
    });
    revalidateTeam();
    // Shown once to the admin; only the hash is stored.
    return { id: user.id, email: user.email, temporaryPassword };
  }, "User created.");
}

export async function updateUserAction(userId: string, input: z.input<typeof baseSchema>) {
  return runAction(async () => {
    const admin = await requireActionUser("user.manage");
    const data = parseInput(baseSchema, input);
    const user = await prisma.user.findUnique({ where: { id: userId }, include: { role: true } });
    if (!user) throw new NotFoundError("User not found.");
    if (data.restrictApplications && data.applicationIds.length === 0) {
      throw new AppError("Select at least one application or allow all applications.", 422, { applicationIds: "Select at least one application." });
    }
    const roleChanged = user.role.key !== data.role;
    if (roleChanged && user.role.key === "ADMIN") await assertNotLastAdmin(user.id);
    if (userId === admin.id && roleChanged) throw new AppError("You cannot change your own role.", 409);

    await prisma.$transaction(async (tx) => {
      await tx.userApplicationAccess.deleteMany({ where: { userId } });
      await tx.user.update({
        where: { id: userId },
        data: {
          name: data.name,
          jobTitle: data.jobTitle || null,
          roleId: await roleId(data.role),
          restrictApplications: data.restrictApplications,
          applicationAccess: data.restrictApplications ? { create: data.applicationIds.map((applicationId) => ({ applicationId })) } : undefined,
        },
      });
    });
    // Permissions are read per request, but sign the user out on role changes for clarity.
    if (roleChanged) await invalidateUserSessions(userId);
    await logActivity({
      actorId: admin.id,
      action: roleChanged ? "USER_ROLE_CHANGED" : "USER_UPDATED",
      entityType: "USER",
      entityId: userId,
      summary: roleChanged
        ? `${admin.name} changed ${user.email}'s role from ${ROLE_LABELS[user.role.key]} to ${ROLE_LABELS[data.role]}`
        : `${admin.name} updated ${user.email}`,
      metadata: { restrictApplications: data.restrictApplications, applications: data.applicationIds.length },
      meta: await getRequestMeta(),
    });
    revalidateTeam();
    return true;
  }, "User updated.");
}

export async function setUserStatusAction(userId: string, status: "ACTIVE" | "DISABLED") {
  return runAction(async () => {
    const admin = await requireActionUser("user.manage");
    const user = await prisma.user.findUnique({ where: { id: userId }, include: { role: true } });
    if (!user) throw new NotFoundError("User not found.");
    if (userId === admin.id) throw new AppError("You cannot disable your own account.", 409);
    if (status === "DISABLED" && user.role.key === "ADMIN") await assertNotLastAdmin(userId);
    await prisma.user.update({ where: { id: userId }, data: { status: z.enum(["ACTIVE", "DISABLED"]).parse(status) } });
    if (status === "DISABLED") await invalidateUserSessions(userId);
    await logActivity({
      actorId: admin.id,
      action: status === "DISABLED" ? "USER_DISABLED" : "USER_ENABLED",
      entityType: "USER",
      entityId: userId,
      summary: `${admin.name} ${status === "DISABLED" ? "disabled" : "re-enabled"} ${user.email}`,
      meta: await getRequestMeta(),
    });
    revalidateTeam();
    return true;
  }, status === "DISABLED" ? "User disabled and signed out." : "User re-enabled.");
}

export async function resetUserPasswordAction(userId: string) {
  return runAction(async () => {
    const admin = await requireActionUser("user.manage");
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError("User not found.");
    const temporaryPassword = generateTemporaryPassword();
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await hashPassword(temporaryPassword), mustChangePassword: true, passwordChangedAt: new Date() },
    });
    await invalidateUserSessions(userId);
    await logActivity({
      actorId: admin.id,
      action: "USER_PASSWORD_RESET",
      entityType: "USER",
      entityId: userId,
      summary: `${admin.name} reset the password of ${user.email}`,
      meta: await getRequestMeta(),
    });
    return { email: user.email, temporaryPassword };
  }, "Password reset. Share the temporary password securely.");
}
