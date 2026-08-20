import { NextResponse } from "next/server";
import { authenticateRobotRequest } from "@/lib/auth";
import { flattenCommand } from "@/lib/commands";
import { prisma } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const robot = await authenticateRobotRequest(
    id,
    req.headers.get("authorization")
  );
  if (!robot) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const stale = new Date(Date.now() - 120_000);
  await prisma.robotCommand.updateMany({
    where: { robotId: id, status: "running", createdAt: { lt: stale } },
    data: { status: "pending" },
  });

  const pending = await prisma.robotCommand.findMany({
    where: { robotId: id, status: "pending" },
    orderBy: { createdAt: "asc" },
    take: 5,
  });

  if (pending.length === 0) {
    return NextResponse.json({ commands: [] });
  }

  await prisma.robotCommand.updateMany({
    where: { id: { in: pending.map((c) => c.id) } },
    data: { status: "running" },
  });

  return NextResponse.json({
    commands: pending.map((c) => flattenCommand({ ...c, status: "running" })),
  });
}
