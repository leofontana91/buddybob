import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateRobotRequest } from "@/lib/auth";
import { prisma } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

const checkInSchema = z.object({
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
});

export async function GET(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const robot = await authenticateRobotRequest(
    id,
    req.headers.get("authorization")
  );
  if (!robot) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const open = await prisma.accessVisit.findMany({
    where: { robotId: id, exitedAt: null },
    orderBy: { enteredAt: "desc" },
  });
  return NextResponse.json({
    inside: open.map((v) => ({
      id: v.id,
      firstName: v.firstName,
      lastName: v.lastName,
      enteredAt: v.enteredAt.toISOString(),
    })),
  });
}

export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const robot = await authenticateRobotRequest(
    id,
    req.headers.get("authorization")
  );
  if (!robot) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = checkInSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Inserisci nome e cognome" },
      { status: 400 }
    );
  }

  const visit = await prisma.accessVisit.create({
    data: {
      robotId: id,
      firstName: parsed.data.firstName.trim(),
      lastName: parsed.data.lastName.trim(),
    },
  });

  return NextResponse.json({
    id: visit.id,
    firstName: visit.firstName,
    lastName: visit.lastName,
    enteredAt: visit.enteredAt.toISOString(),
    speak: `Benvenuto ${visit.firstName}. Ingresso registrato.`,
  });
}
