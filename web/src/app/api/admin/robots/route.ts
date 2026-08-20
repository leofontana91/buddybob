import { NextResponse } from "next/server";
import { requireSession, adminRobotIds } from "@/lib/auth";
import { prisma } from "@/lib/db";

/** Robots available to the logged-in admin (or all for super). */
export async function GET() {
  const session = await requireSession(["ADMIN", "SUPER_ADMIN"]);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.role === "SUPER_ADMIN") {
    const robots = await prisma.robot.findMany({ orderBy: { displayName: "asc" } });
    return NextResponse.json({
      robots: robots.map((r) => ({ id: r.id, displayName: r.displayName })),
    });
  }

  const ids = await adminRobotIds(session.accountId);
  const robots = await prisma.robot.findMany({
    where: { id: { in: ids } },
    orderBy: { displayName: "asc" },
  });
  return NextResponse.json({
    robots: robots.map((r) => ({ id: r.id, displayName: r.displayName })),
  });
}
