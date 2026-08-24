import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateRobotRequest } from "@/lib/auth";
import { prisma } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

const schema = z.object({
  place: z.string().trim().max(80).optional(),
  activity: z.string().trim().max(120).optional(),
});

export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const robot = await authenticateRobotRequest(
    id,
    req.headers.get("authorization")
  );
  if (!robot) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Dati non validi" }, { status: 400 });
  }
  await prisma.robot.update({
    where: { id },
    data: {
      lastSeenAt: new Date(),
      lastPlace: parsed.data.place || undefined,
      lastActivity: parsed.data.activity || undefined,
    },
  });
  return NextResponse.json({ ok: true });
}
