import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "Token mancante" }, { status: 400 });
  }

  const account = await prisma.account.findFirst({
    where: {
      activationToken: token,
      role: "ADMIN",
    },
  });
  if (!account) {
    return NextResponse.json({ error: "Link non valido" }, { status: 404 });
  }
  if (
    account.activationExpires &&
    account.activationExpires.getTime() < Date.now()
  ) {
    return NextResponse.json({ error: "Link scaduto" }, { status: 410 });
  }

  return NextResponse.json({
    email: account.email,
    name: account.name,
    companyName: account.companyName,
    city: account.city,
  });
}

const bodySchema = z.object({
  token: z.string().min(1),
  password: z.string().min(6),
});

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Dati non validi" }, { status: 400 });
  }

  const account = await prisma.account.findFirst({
    where: {
      activationToken: parsed.data.token,
      role: "ADMIN",
    },
  });
  if (!account) {
    return NextResponse.json({ error: "Link non valido" }, { status: 404 });
  }
  if (
    account.activationExpires &&
    account.activationExpires.getTime() < Date.now()
  ) {
    return NextResponse.json({ error: "Link scaduto" }, { status: 410 });
  }

  await prisma.account.update({
    where: { id: account.id },
    data: {
      passwordHash: await bcrypt.hash(parsed.data.password, 10),
      status: "active",
      activationToken: null,
      activationExpires: null,
    },
  });

  return NextResponse.json({ ok: true, email: account.email });
}
