import { NextResponse } from "next/server";
import { requireSession, adminRobotIds, effectiveAdminId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parseModules, DEFAULT_ADMIN_MODULES } from "@/lib/modules";

/** Robots available to the logged-in admin (or all for super). */
export async function GET() {
  const session = await requireSession(["ADMIN", "SUPER_ADMIN"]);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const scopedAdminId = effectiveAdminId(session);
  let modulesJson: string | null = null;
  if (scopedAdminId) {
    const admin = await prisma.account.findUnique({
      where: { id: scopedAdminId },
    });
    modulesJson = admin?.modulesJson ?? null;
    const ids = await adminRobotIds(scopedAdminId);
    const robots = await prisma.robot.findMany({
      where: { id: { in: ids } },
      orderBy: { displayName: "asc" },
    });
    return NextResponse.json({
      modules: parseModules(modulesJson),
      robots: robots.map((r) => ({ id: r.id, displayName: r.displayName })),
    });
  }

  const robots = await prisma.robot.findMany({
    orderBy: { displayName: "asc" },
  });
  return NextResponse.json({
    modules: DEFAULT_ADMIN_MODULES,
    robots: robots.map((r) => ({ id: r.id, displayName: r.displayName })),
  });
}
