import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateRobotRequest } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { sendOperatorCallEmail } from "@/lib/mail";

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

  const settings = robot.settings;
  const isCall = parsed.data.type === "call_operator";

  const notifyInbox = isCall
    ? settings?.callOperatorNotifyInbox !== false
    : true;
  const notifyPopup = isCall ? !!settings?.callOperatorNotifyPopup : false;
  const notifyEmail = isCall ? !!settings?.callOperatorNotifyEmail : false;

  const defaultMsg = isCall
    ? "Un ospite richiede un operatore"
    : "Ospite arrivato";
  const message = parsed.data.message ?? defaultMsg;

  let alertId: string | null = null;
  if (notifyInbox || notifyPopup) {
    const alert = await prisma.operatorAlert.create({
      data: {
        robotId: id,
        type: parsed.data.type,
        message,
        appointmentId: parsed.data.appointmentId,
        inInbox: notifyInbox,
        asPopup: notifyPopup,
      },
    });
    alertId = alert.id;
  }

  let emailSent: boolean | undefined;
  let mailError: string | undefined;
  if (notifyEmail) {
    const to = (settings?.callOperatorEmail ?? "").trim();
    const mail = await sendOperatorCallEmail({
      to,
      robotName: robot.displayName,
      message,
    });
    emailSent = mail.sent;
    mailError = mail.mailError;
  }

  const speak =
    settings?.callOperatorSpeak ?? "Sto chiamando un operatore";

  return NextResponse.json({
    id: alertId,
    type: parsed.data.type,
    message,
    speak,
    notified: {
      inbox: notifyInbox,
      popup: notifyPopup,
      email: notifyEmail,
      emailSent,
      mailError,
    },
  });
}
