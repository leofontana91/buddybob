import { NextResponse } from "next/server";
import { z } from "zod";
import { canAccessRobot, requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

const createSchema = z.object({
  robotId: z.string().min(1),
  name: z.string().min(1).max(80),
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

  const forms = await prisma.formTemplate.findMany({
    where: { robotId },
    include: { _count: { select: { fields: true, submissions: true } } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({
    forms: forms.map((f) => ({
      id: f.id,
      name: f.name,
      enabled: f.enabled,
      fieldCount: f._count.fields,
      submissionCount: f._count.submissions,
      createdAt: f.createdAt.toISOString(),
    })),
  });
}

export async function POST(req: Request) {
  const session = await requireSession(["ADMIN", "SUPER_ADMIN"]);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Nome modulo richiesto" }, { status: 400 });
  }
  if (!(await canAccessRobot(session, parsed.data.robotId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const form = await prisma.formTemplate.create({
    data: {
      robotId: parsed.data.robotId,
      name: parsed.data.name.trim(),
    },
  });
  return NextResponse.json({ id: form.id, name: form.name, enabled: form.enabled });
}
