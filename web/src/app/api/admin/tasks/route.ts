import { NextResponse } from "next/server";
import { z } from "zod";
import { canAccessRobot, requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { TaskStep } from "@/lib/commands";

const stepSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("speak"), text: z.string().trim().min(1).max(400) }),
  z.object({
    type: z.literal("button"),
    label: z.string().trim().min(1).max(40),
    speakOnPress: z.string().trim().max(400).optional(),
  }),
  z.object({ type: z.literal("goto"), placeName: z.string().trim().min(1) }),
  z.object({ type: z.literal("return") }),
  z.object({ type: z.literal("wait"), seconds: z.number().int().min(1).max(300) }),
]);

const createSchema = z.object({
  robotId: z.string().min(1),
  name: z.string().trim().min(1).max(80),
  steps: z.array(stepSchema).min(1).max(8),
});

function parseSteps(raw: string): TaskStep[] {
  try {
    return JSON.parse(raw) as TaskStep[];
  } catch {
    return [];
  }
}

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
  const tasks = await prisma.robotTask.findMany({
    where: { robotId },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({
    tasks: tasks.map((t) => ({
      id: t.id,
      name: t.name,
      steps: parseSteps(t.steps),
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
    return NextResponse.json({ error: "Dati task non validi" }, { status: 400 });
  }
  if (!(await canAccessRobot(session, parsed.data.robotId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const task = await prisma.robotTask.create({
    data: {
      robotId: parsed.data.robotId,
      name: parsed.data.name,
      steps: JSON.stringify(parsed.data.steps),
    },
  });
  return NextResponse.json({
    task: { id: task.id, name: task.name, steps: parsed.data.steps },
  });
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
  const existing = await prisma.robotTask.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Non trovato" }, { status: 404 });
  }
  if (!(await canAccessRobot(session, existing.robotId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await prisma.robotTask.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
