import { NextResponse } from "next/server";
import { z } from "zod";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import {
  DEFAULT_ADMIN_MODULES,
  parseModules,
  stringifyModules,
  AdminModules,
} from "@/lib/modules";
import { newActivationToken, sendActivationEmail } from "@/lib/mail";

export async function GET() {
  const session = await requireSession(["SUPER_ADMIN"]);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [admins, robots] = await Promise.all([
    prisma.account.findMany({
      where: { role: "ADMIN" },
      include: {
        robotLinks: { include: { robot: true } },
        _count: { select: { users: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.robot.findMany({
      include: {
        adminLinks: { include: { admin: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return NextResponse.json({
    moduleDefaults: DEFAULT_ADMIN_MODULES,
    admins: admins.map((a) => ({
      id: a.id,
      email: a.email,
      name: a.name,
      companyName: a.companyName,
      address: a.address,
      city: a.city,
      status: a.status,
      userCount: a._count.users,
      modules: parseModules(a.modulesJson),
      robots: a.robotLinks.map((l) => ({
        id: l.robot.id,
        displayName: l.robot.displayName,
        serialNumber: l.robot.serialNumber,
        enabled: l.robot.enabled,
        pairingOpenUntil: l.robot.pairingOpenUntil?.toISOString() ?? null,
      })),
    })),
    robots: robots.map((r) => ({
      id: r.id,
      displayName: r.displayName,
      serialNumber: r.serialNumber,
      apiKey: r.apiKey,
      enabled: r.enabled,
      admins: r.adminLinks.map((l) => ({
        id: l.admin.id,
        name: l.admin.name,
        companyName: l.admin.companyName,
        email: l.admin.email,
      })),
    })),
  });
}

const modulesSchema = z.record(z.string(), z.boolean()).optional();

const createAdminSchema = z.object({
  action: z.literal("create_admin"),
  email: z.string().email(),
  companyName: z.string().min(1),
  name: z.string().min(1), // persona
  address: z.string().min(1),
  city: z.string().min(1),
  robotSerial: z.string().min(1),
  robotDisplayName: z.string().min(1).optional(),
  robotEnabled: z.boolean().default(true),
  modules: modulesSchema,
});

const updateModulesSchema = z.object({
  action: z.literal("update_modules"),
  adminId: z.string(),
  modules: z.record(z.string(), z.boolean()),
});

const setAdminStatusSchema = z.object({
  action: z.literal("set_admin_status"),
  adminId: z.string(),
  status: z.enum(["active", "disabled", "pending"]),
});

const setRobotEnabledSchema = z.object({
  action: z.literal("set_robot_enabled"),
  robotId: z.string(),
  enabled: z.boolean(),
});

const openPairingSchema = z.object({
  action: z.literal("open_pairing"),
  robotId: z.string(),
});

const resendSchema = z.object({
  action: z.literal("resend_activation"),
  adminId: z.string(),
});

const assignSchema = z.object({
  action: z.literal("assign_robot"),
  adminId: z.string(),
  robotId: z.string(),
});

const unassignSchema = z.object({
  action: z.literal("unassign_robot"),
  adminId: z.string(),
  robotId: z.string(),
});

export async function POST(req: Request) {
  const session = await requireSession(["SUPER_ADMIN"]);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const action = body?.action;

  if (action === "create_admin") {
    const parsed = createAdminSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dati non validi", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const d = parsed.data;
    const email = d.email.toLowerCase();
    const exists = await prisma.account.findUnique({ where: { email } });
    if (exists) {
      return NextResponse.json({ error: "Email già usata" }, { status: 409 });
    }

    const serial = d.robotSerial.trim();
    const serialTaken = await prisma.robot.findUnique({
      where: { serialNumber: serial },
    });
    if (serialTaken) {
      return NextResponse.json(
        { error: "Numero di serie robot già registrato" },
        { status: 409 }
      );
    }

    const token = newActivationToken();
    const expires = new Date(Date.now() + 72 * 60 * 60 * 1000);
    const modules = {
      ...DEFAULT_ADMIN_MODULES,
      ...(d.modules as Partial<AdminModules> | undefined),
    };

    const robotId = `bob-${serial
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40)}`;
    const apiKey = `bob_${randomBytes(16).toString("hex")}`;
    const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

    const admin = await prisma.account.create({
      data: {
        email,
        name: d.name,
        companyName: d.companyName,
        address: d.address,
        city: d.city,
        role: "ADMIN",
        status: "pending",
        passwordHash: null,
        activationToken: token,
        activationExpires: expires,
        modulesJson: stringifyModules(modules),
      },
    });

    const robot = await prisma.robot.create({
      data: {
        id: robotId,
        serialNumber: serial,
        displayName: d.robotDisplayName || `${d.companyName} Robot`,
        apiKey,
        enabled: d.robotEnabled,
        settings: {
          create: {
            bookingMode: "qr",
            bookingUrl: `${base}/book/${robotId}`,
          },
        },
      },
    });

    await prisma.adminRobot.create({
      data: { adminId: admin.id, robotId: robot.id },
    });

    const mail = await sendActivationEmail({
      to: email,
      companyName: d.companyName,
      personName: d.name,
      token,
    });

    return NextResponse.json({
      adminId: admin.id,
      robotId: robot.id,
      serialNumber: robot.serialNumber,
      apiKey: robot.apiKey,
      status: admin.status,
      emailSent: mail.sent,
      activationUrl: mail.activationUrl,
    });
  }

  if (action === "update_modules") {
    const parsed = updateModulesSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Dati non validi" }, { status: 400 });
    }
    const admin = await prisma.account.findFirst({
      where: { id: parsed.data.adminId, role: "ADMIN" },
    });
    if (!admin) {
      return NextResponse.json({ error: "Admin non trovato" }, { status: 404 });
    }
    const modules = {
      ...parseModules(admin.modulesJson),
      ...parsed.data.modules,
    };
    await prisma.account.update({
      where: { id: admin.id },
      data: { modulesJson: stringifyModules(modules) },
    });
    return NextResponse.json({ ok: true, modules });
  }

  if (action === "set_admin_status") {
    const parsed = setAdminStatusSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Dati non validi" }, { status: 400 });
    }
    await prisma.account.update({
      where: { id: parsed.data.adminId },
      data: { status: parsed.data.status },
    });
    return NextResponse.json({ ok: true });
  }

  if (action === "set_robot_enabled") {
    const parsed = setRobotEnabledSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Dati non validi" }, { status: 400 });
    }
    await prisma.robot.update({
      where: { id: parsed.data.robotId },
      data: { enabled: parsed.data.enabled },
    });
    return NextResponse.json({ ok: true });
  }

  if (action === "open_pairing") {
    const parsed = openPairingSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Dati non validi" }, { status: 400 });
    }
    const pairingCode = String(Math.floor(100000 + Math.random() * 900000));
    const pairingOpenUntil = new Date(Date.now() + 15 * 60 * 1000);
    const robot = await prisma.robot.update({
      where: { id: parsed.data.robotId },
      data: { pairingCode, pairingOpenUntil },
    });
    return NextResponse.json({
      ok: true,
      robotId: robot.id,
      serialNumber: robot.serialNumber,
      displayName: robot.displayName,
      pairingCode,
      pairingOpenUntil: pairingOpenUntil.toISOString(),
    });
  }

  if (action === "resend_activation") {
    const parsed = resendSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Dati non validi" }, { status: 400 });
    }
    const admin = await prisma.account.findFirst({
      where: { id: parsed.data.adminId, role: "ADMIN" },
    });
    if (!admin) {
      return NextResponse.json({ error: "Admin non trovato" }, { status: 404 });
    }
    const token = newActivationToken();
    await prisma.account.update({
      where: { id: admin.id },
      data: {
        activationToken: token,
        activationExpires: new Date(Date.now() + 72 * 60 * 60 * 1000),
        status: "pending",
        passwordHash: null,
      },
    });
    const mail = await sendActivationEmail({
      to: admin.email,
      companyName: admin.companyName ?? admin.name,
      personName: admin.name,
      token,
    });
    return NextResponse.json({
      ok: true,
      emailSent: mail.sent,
      activationUrl: mail.activationUrl,
    });
  }

  if (action === "assign_robot") {
    const parsed = assignSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Dati non validi" }, { status: 400 });
    }
    await prisma.adminRobot.upsert({
      where: {
        adminId_robotId: {
          adminId: parsed.data.adminId,
          robotId: parsed.data.robotId,
        },
      },
      update: {},
      create: {
        adminId: parsed.data.adminId,
        robotId: parsed.data.robotId,
      },
    });
    return NextResponse.json({ ok: true });
  }

  if (action === "unassign_robot") {
    const parsed = unassignSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Dati non validi" }, { status: 400 });
    }
    await prisma.adminRobot.deleteMany({
      where: {
        adminId: parsed.data.adminId,
        robotId: parsed.data.robotId,
      },
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Azione sconosciuta" }, { status: 400 });
}
