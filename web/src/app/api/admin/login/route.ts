import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { createSession, homeForRole, Role } from "@/lib/auth";
import { ensureSeedIfEmpty } from "@/lib/ensureSeed";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: Request) {
  try {
    await ensureSeedIfEmpty();
  } catch (e) {
    console.error("ensureSeedIfEmpty failed", e);
  }

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Dati non validi" }, { status: 400 });
  }

  const account = await prisma.account.findUnique({
    where: { email: parsed.data.email.toLowerCase() },
  });

  if (!account) {
    return NextResponse.json({ error: "Credenziali errate" }, { status: 401 });
  }

  if (account.status === "disabled") {
    return NextResponse.json(
      { error: "Account disabilitato. Contatta il supporto." },
      { status: 403 }
    );
  }

  if (account.status === "pending" || !account.passwordHash) {
    return NextResponse.json(
      {
        error:
          "Account non ancora attivato. Controlla la mail di attivazione.",
      },
      { status: 403 }
    );
  }

  if (!(await bcrypt.compare(parsed.data.password, account.passwordHash))) {
    return NextResponse.json({ error: "Credenziali errate" }, { status: 401 });
  }

  const role = account.role as Role;
  await createSession({
    accountId: account.id,
    email: account.email,
    name: account.name,
    role,
    adminId: account.adminId,
  });

  return NextResponse.json({
    ok: true,
    name: account.name,
    role,
    redirect: homeForRole(role),
  });
}
