import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { createSession, requireSession } from "@/lib/auth";

const schema = z.object({
  adminId: z.string().min(1).nullable(),
});

/** Super Admin opens (or leaves) a client's admin panel. */
export async function POST(req: Request) {
  const session = await requireSession(["SUPER_ADMIN"]);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Dati non validi" }, { status: 400 });
  }

  const adminId = parsed.data.adminId;
  if (!adminId) {
    await createSession({ ...session, actingAdminId: null });
    return NextResponse.json({ ok: true, redirect: "/super" });
  }

  const admin = await prisma.account.findFirst({
    where: { id: adminId, role: "ADMIN" },
  });
  if (!admin) {
    return NextResponse.json({ error: "Admin non trovato" }, { status: 404 });
  }

  await createSession({ ...session, actingAdminId: admin.id });
  return NextResponse.json({
    ok: true,
    redirect: "/admin",
    companyName: admin.companyName ?? admin.name,
  });
}
