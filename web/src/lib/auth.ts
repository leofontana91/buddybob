import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { prisma } from "./db";
import { getAuthSecret } from "./auth-secret";

const COOKIE = "bob_admin_session";

export type Role = "SUPER_ADMIN" | "ADMIN" | "USER";

export type SessionPayload = {
  accountId: string;
  email: string;
  name: string;
  role: Role;
  adminId: string | null;
  /** Super Admin viewing a specific client's admin panel. */
  actingAdminId: string | null;
};

function secret() {
  return getAuthSecret();
}

export async function createSession(payload: SessionPayload) {
  const token = await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret());

  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function destroySession() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export async function getSession(): Promise<SessionPayload | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    const role = String(payload.role) as Role;
    return {
      accountId: String(payload.accountId),
      email: String(payload.email),
      name: String(payload.name),
      role,
      adminId: payload.adminId ? String(payload.adminId) : null,
      actingAdminId: payload.actingAdminId
        ? String(payload.actingAdminId)
        : null,
    };
  } catch {
    return null;
  }
}

export async function requireSession(roles?: Role[]) {
  const session = await getSession();
  if (!session) return null;
  if (roles && !roles.includes(session.role)) return null;
  return session;
}

/** Admin whose tenant data this session should see. */
export function effectiveAdminId(session: SessionPayload): string | null {
  if (session.role === "ADMIN") return session.accountId;
  if (session.role === "SUPER_ADMIN") return session.actingAdminId;
  return null;
}

export async function adminRobotIds(adminId: string): Promise<string[]> {
  const links = await prisma.adminRobot.findMany({
    where: { adminId },
    select: { robotId: true },
  });
  return links.map((l) => l.robotId);
}

export async function canAccessRobot(
  session: SessionPayload,
  robotId: string
): Promise<boolean> {
  if (session.role === "SUPER_ADMIN" && !session.actingAdminId) return true;
  const adminId = effectiveAdminId(session);
  if (!adminId) return false;
  const link = await prisma.adminRobot.findUnique({
    where: {
      adminId_robotId: { adminId, robotId },
    },
  });
  return !!link;
}

export async function requireRobot(robotId: string) {
  return prisma.robot.findUnique({
    where: { id: robotId },
    include: { settings: true },
  });
}

export async function authenticateRobotRequest(
  robotId: string,
  authHeader: string | null
) {
  const robot = await requireRobot(robotId);
  if (!robot || !robot.enabled) return null;
  if (!authHeader?.startsWith("Bearer ")) return null;
  const key = authHeader.slice("Bearer ".length).trim();
  if (key !== robot.apiKey) return null;
  return robot;
}

export function homeForRole(role: Role): string {
  if (role === "SUPER_ADMIN") return "/super";
  if (role === "ADMIN") return "/admin";
  return "/me";
}

export { COOKIE };
