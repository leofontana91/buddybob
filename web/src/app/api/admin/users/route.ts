import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireSession, effectiveAdminId } from "@/lib/auth";

export async function GET() {
  const session = await requireSession(["ADMIN", "SUPER_ADMIN"]);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const adminId = effectiveAdminId(session);
  if (!adminId) {
    return NextResponse.json({ error: "Nessun cliente selezionato" }, { status: 400 });
  }

  const users = await prisma.account.findMany({
    where: { role: "USER", adminId },
    include: {
      _count: { select: { appointments: true } },
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({
    users: users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      appointmentCount: u._count.appointments,
    })),
  });
}

const createSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
});

export async function POST(req: Request) {
  const session = await requireSession(["ADMIN", "SUPER_ADMIN"]);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const adminId = effectiveAdminId(session);
  if (!adminId) {
    return NextResponse.json({ error: "Nessun cliente selezionato" }, { status: 400 });
  }

  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Dati non validi" }, { status: 400 });
  }

  const exists = await prisma.account.findUnique({
    where: { email: parsed.data.email.toLowerCase() },
  });
  if (exists) {
    return NextResponse.json({ error: "Email già usata" }, { status: 409 });
  }

  const user = await prisma.account.create({
    data: {
      name: parsed.data.name,
      email: parsed.data.email.toLowerCase(),
      passwordHash: await bcrypt.hash(parsed.data.password, 10),
      role: "USER",
      adminId,
    },
  });

  return NextResponse.json({ id: user.id, name: user.name, email: user.email });
}

export async function DELETE(req: Request) {
  const session = await requireSession(["ADMIN", "SUPER_ADMIN"]);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const adminId = effectiveAdminId(session);
  if (!adminId) {
    return NextResponse.json({ error: "Nessun cliente selezionato" }, { status: 400 });
  }
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id richiesto" }, { status: 400 });
  }

  const user = await prisma.account.findFirst({
    where: { id, role: "USER", adminId },
  });
  if (!user) {
    return NextResponse.json({ error: "Utente non trovato" }, { status: 404 });
  }

  await prisma.account.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
