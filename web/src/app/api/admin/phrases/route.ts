import { NextResponse } from "next/server";
import { z } from "zod";
import { canAccessRobot, requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

const createSchema = z.object({
  robotId: z.string().min(1),
  text: z.string().trim().min(1).max(400),
});

export async function GET(req: Request) {
  const session = await requireSession(["ADMIN", "SUPER_ADMIN"]);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const robotId = new URL(req.url).searchParams.get("robotId");
  if (!robotId) {
    return NextResponse.json({ error: "robotId richiesto" }, { status: 400 });
  }
  if (!(await canAccessRobot(session, robotId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const phrases = await prisma.savedPhrase.findMany({
    where: { robotId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  return NextResponse.json({ phrases });
}

export async function POST(req: Request) {
  const session = await requireSession(["ADMIN", "SUPER_ADMIN"]);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Dati non validi" }, { status: 400 });
  }
  if (!(await canAccessRobot(session, parsed.data.robotId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const count = await prisma.savedPhrase.count({
    where: { robotId: parsed.data.robotId },
  });
  const phrase = await prisma.savedPhrase.create({
    data: {
      robotId: parsed.data.robotId,
      text: parsed.data.text,
      sortOrder: count,
    },
  });
  return NextResponse.json({ phrase });
}

export async function DELETE(req: Request) {
  const session = await requireSession(["ADMIN", "SUPER_ADMIN"]);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const id = new URL(req.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id richiesto" }, { status: 400 });
  }
  const existing = await prisma.savedPhrase.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Non trovato" }, { status: 404 });
  }
  if (!(await canAccessRobot(session, existing.robotId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await prisma.savedPhrase.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
