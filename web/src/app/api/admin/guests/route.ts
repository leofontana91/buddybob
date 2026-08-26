import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession, effectiveAdminId } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const session = await requireSession(["ADMIN", "SUPER_ADMIN"]);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const adminId = effectiveAdminId(session);
  if (!adminId) {
    return NextResponse.json({ error: "Nessuna azienda" }, { status: 400 });
  }

  const guests = await prisma.guestContact.findMany({
    where: { adminId },
    orderBy: [{ name: "asc" }],
  });

  return NextResponse.json({
    guests: guests.map((g) => ({
      id: g.id,
      name: g.name,
      phone: g.phone,
      email: g.email,
      company: g.company,
      notes: g.notes,
      lastSeenAt: g.lastSeenAt?.toISOString() ?? null,
      updatedAt: g.updatedAt.toISOString(),
    })),
  });
}

const upsertSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().max(40).optional(),
  email: z.union([z.literal(""), z.string().email()]).optional(),
  company: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export async function POST(req: Request) {
  const session = await requireSession(["ADMIN", "SUPER_ADMIN"]);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const adminId = effectiveAdminId(session);
  if (!adminId) {
    return NextResponse.json({ error: "Nessuna azienda" }, { status: 400 });
  }

  const parsed = upsertSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Dati non validi" }, { status: 400 });
  }

  const data = {
    name: parsed.data.name,
    phone: parsed.data.phone ?? "",
    email: parsed.data.email ?? "",
    company: parsed.data.company ?? "",
    notes: parsed.data.notes ?? "",
  };

  if (parsed.data.id) {
    const existing = await prisma.guestContact.findFirst({
      where: { id: parsed.data.id, adminId },
    });
    if (!existing) {
      return NextResponse.json({ error: "Non trovato" }, { status: 404 });
    }
    const updated = await prisma.guestContact.update({
      where: { id: existing.id },
      data,
    });
    return NextResponse.json({ guest: updated });
  }

  const created = await prisma.guestContact.create({
    data: { adminId, ...data },
  });
  return NextResponse.json({ guest: created });
}

export async function DELETE(req: Request) {
  const session = await requireSession(["ADMIN", "SUPER_ADMIN"]);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const adminId = effectiveAdminId(session);
  if (!adminId) {
    return NextResponse.json({ error: "Nessuna azienda" }, { status: 400 });
  }
  const id = new URL(req.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id richiesto" }, { status: 400 });
  }
  await prisma.guestContact.deleteMany({ where: { id, adminId } });
  return NextResponse.json({ ok: true });
}
