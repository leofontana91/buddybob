import { NextResponse } from "next/server";
import { z } from "zod";
import { canAccessRobot, requireSession } from "@/lib/auth";
import { flattenCommand } from "@/lib/commands";
import { prisma } from "@/lib/db";

const createSchema = z.object({
  robotId: z.string().min(1),
  type: z.enum(["goto", "speak", "stop", "task"]),
  placeName: z.string().min(1).optional(),
  text: z.string().min(1).max(500).optional(),
  after: z.enum(["stay", "return"]).optional(),
  returnAfterSec: z.number().int().min(0).max(600).optional(),
  taskId: z.string().min(1).optional(),
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

  const commands = await prisma.robotCommand.findMany({
    where: { robotId },
    orderBy: { createdAt: "desc" },
    take: 30,
  });
  return NextResponse.json({ commands: commands.map(flattenCommand) });
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

  const { type, placeName, text, after, returnAfterSec, taskId } = parsed.data;
  if (type === "goto" && !placeName) {
    return NextResponse.json(
      { error: "Scegli o scrivi un punto della mappa" },
      { status: 400 }
    );
  }
  if (type === "speak" && !text) {
    return NextResponse.json({ error: "Scrivi il testo da far dire" }, { status: 400 });
  }

  let payload: Record<string, unknown> = {
    placeName: placeName?.trim(),
    text: text?.trim(),
    after: after ?? "stay",
    returnAfterSec: returnAfterSec ?? 0,
  };

  if (type === "task") {
    if (!taskId) {
      return NextResponse.json({ error: "Scegli una task" }, { status: 400 });
    }
    const task = await prisma.robotTask.findFirst({
      where: { id: taskId, robotId: parsed.data.robotId },
    });
    if (!task) {
      return NextResponse.json({ error: "Task non trovata" }, { status: 404 });
    }
    payload = {
      taskName: task.name,
      steps: JSON.parse(task.steps || "[]"),
    };
  }

  const cmd = await prisma.robotCommand.create({
    data: {
      robotId: parsed.data.robotId,
      type,
      payload: JSON.stringify(payload),
    },
  });
  return NextResponse.json(flattenCommand(cmd));
}
