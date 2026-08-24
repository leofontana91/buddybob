import { NextResponse } from "next/server";
import { requireSession, adminRobotIds, effectiveAdminId } from "@/lib/auth";
import { prisma } from "@/lib/db";

/** Robots available to the logged-in admin (or all for super). */
export async function GET() {
  const session = await requireSession(["ADMIN", "SUPER_ADMIN"]);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const scopedAdminId = effectiveAdminId(session);
  if (scopedAdminId) {
    const ids = await adminRobotIds(scopedAdminId);
    const robots = await prisma.robot.findMany({
      where: { id: { in: ids } },
      orderBy: { displayName: "asc" },
    });
    return NextResponse.json({
      robots: robots.map((r) => ({ id: r.id, displayName: r.displayName })),
    });
  }

  const robots = await prisma.robot.findMany({
    orderBy: { displayName: "asc" },
  });
  return NextResponse.json({
    robots: robots.map((r) => ({ id: r.id, displayName: r.displayName })),
  });
}
