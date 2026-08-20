import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateRobotRequest } from "@/lib/auth";
import { flattenCommand } from "@/lib/commands";
import { prisma } from "@/lib/db";

type Ctx = { params: Promise<{ id: string; commandId: string }> };

const bodySchema = z.object({
  status: z.enum(["done", "failed"]),
  error: z.string().max(500).optional(),
});

export async function POST(req: Request, ctx: Ctx) {
  const { id, commandId } = await ctx.params;
  const robot = await authenticateRobotRequest(
    id,
    req.headers.get("authorization")
  );
  if (!robot) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Dati non validi" }, { status: 400 });
  }

  const existing = await prisma.robotCommand.findFirst({
    where: { id: commandId, robotId: id },
  });
  if (!existing) {
    return NextResponse.json({ error: "Comando non trovato" }, { status: 404 });
  }

  const cmd = await prisma.robotCommand.update({
    where: { id: commandId },
    data: {
      status: parsed.data.status,
      error: parsed.data.error,
      ackedAt: new Date(),
    },
  });
  return NextResponse.json(flattenCommand(cmd));
}
