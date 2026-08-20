import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateRobotRequest } from "@/lib/auth";
import { prisma } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  type: z.enum(["call_operator", "guest_arrived"]),
  message: z.string().min(1).optional(),
  appointmentId: z.string().optional(),
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

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const defaultMsg =
    parsed.data.type === "call_operator"
      ? "Un ospite richiede un operatore"
      : "Ospite arrivato";

  const alert = await prisma.operatorAlert.create({
    data: {
      robotId: id,
      type: parsed.data.type,
      message: parsed.data.message ?? defaultMsg,
      appointmentId: parsed.data.appointmentId,
    },
  });

  const speak =
    robot.settings?.callOperatorSpeak ?? "Sto chiamando un operatore";

  return NextResponse.json({
    id: alert.id,
    type: alert.type,
    message: alert.message,
    speak,
  });
}
