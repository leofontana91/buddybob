import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { publicAppUrl } from "@/lib/appUrl";
import {
  newActivationToken,
  newPasswordResetToken,
  sendActivationEmail,
  sendPasswordResetEmail,
} from "@/lib/mail";

const schema = z.object({
  email: z.string().email(),
});

const GENERIC_OK = {
  ok: true,
  message:
    "Se l'email è registrata, riceverai un messaggio con le istruzioni.",
};

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Email non valida" }, { status: 400 });
  }

  const email = parsed.data.email.trim().toLowerCase();
  const account = await prisma.account.findUnique({ where: { email } });

  if (!account || account.status === "disabled") {
    return NextResponse.json(GENERIC_OK);
  }

  const base = publicAppUrl(req);

  if (account.status === "pending" || !account.passwordHash) {
    if (account.role !== "ADMIN") {
      return NextResponse.json(GENERIC_OK);
    }
    const token = newActivationToken();
    await prisma.account.update({
      where: { id: account.id },
      data: {
        activationToken: token,
        activationExpires: new Date(Date.now() + 72 * 60 * 60 * 1000),
      },
    });
    const mail = await sendActivationEmail({
      to: account.email,
      companyName: account.companyName ?? account.name,
      personName: account.name,
      token,
      baseUrl: base,
    });
    if (!mail.sent) {
      console.error("Forgot activation mail failed", mail.mailError);
    }
    return NextResponse.json(GENERIC_OK);
  }

  const token = newPasswordResetToken();
  await prisma.account.update({
    where: { id: account.id },
    data: {
      activationToken: token,
      activationExpires: new Date(Date.now() + 2 * 60 * 60 * 1000),
    },
  });
  const mail = await sendPasswordResetEmail({
    to: account.email,
    personName: account.name,
    token,
    baseUrl: base,
  });
  if (!mail.sent) {
    console.error("Password reset mail failed", mail.mailError);
  }

  return NextResponse.json(GENERIC_OK);
}
