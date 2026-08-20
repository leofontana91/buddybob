import bcrypt from "bcryptjs";
import { setHours, setMinutes, startOfDay } from "date-fns";
import { prisma } from "@/lib/db";
import { stringifyModules, DEFAULT_ADMIN_MODULES } from "@/lib/modules";

/** Creates demo accounts/robot only when the database is empty. */
export async function ensureSeedIfEmpty() {
  const count = await prisma.account.count();
  if (count > 0) return { seeded: false };

  const hash = async (p: string) => bcrypt.hash(p, 10);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://localhost";

  await prisma.account.create({
    data: {
      email: "super@bobrobotics.com",
      name: "Super Admin BOB",
      passwordHash: await hash("super123"),
      role: "SUPER_ADMIN",
      status: "active",
    },
  });

  const admin = await prisma.account.create({
    data: {
      email: "admin@bobrobotics.com",
      name: "Mario Responsabile",
      companyName: "Azienda Demo Srl",
      address: "Via Roma 1",
      city: "Milano",
      passwordHash: await hash("admin123"),
      role: "ADMIN",
      status: "active",
      modulesJson: stringifyModules(DEFAULT_ADMIN_MODULES),
    },
  });

  const userMario = await prisma.account.create({
    data: {
      email: "mario@example.com",
      name: "Mario Rossi",
      passwordHash: await hash("user123"),
      role: "USER",
      status: "active",
      adminId: admin.id,
    },
  });

  const userLaura = await prisma.account.create({
    data: {
      email: "laura@example.com",
      name: "Laura Bianchi",
      passwordHash: await hash("user123"),
      role: "USER",
      status: "active",
      adminId: admin.id,
    },
  });

  const robot = await prisma.robot.create({
    data: {
      id: "bob-demo-001",
      serialNumber: "SN-BOB-DEMO-001",
      displayName: "BOB Demo",
      apiKey: "bob-demo-api-key",
      enabled: true,
      timezone: "Europe/Rome",
      locale: "it-IT",
      settings: {
        create: {
          bookingMode: "qr",
          bookingUrl: `${appUrl}/book/bob-demo-001`,
        },
      },
    },
  });

  await prisma.adminRobot.create({
    data: { adminId: admin.id, robotId: robot.id },
  });

  const form = await prisma.formTemplate.create({
    data: {
      robotId: robot.id,
      name: "Registrazione ospite",
      enabled: true,
    },
  });

  await prisma.formField.createMany({
    data: [
      {
        templateId: form.id,
        label: "Nome e cognome",
        type: "text",
        required: true,
        sortOrder: 0,
      },
      {
        templateId: form.id,
        label: "Azienda",
        type: "text",
        required: false,
        sortOrder: 1,
      },
      {
        templateId: form.id,
        label: "Hai già un badge?",
        type: "yesno",
        required: true,
        sortOrder: 2,
      },
    ],
  });

  const today = startOfDay(new Date());
  await prisma.appointment.createMany({
    data: [
      {
        robotId: robot.id,
        userId: userMario.id,
        guestName: userMario.name,
        startsAt: setMinutes(setHours(today, 10), 0),
        status: "scheduled",
      },
      {
        robotId: robot.id,
        userId: userLaura.id,
        guestName: userLaura.name,
        startsAt: setMinutes(setHours(today, 11), 30),
        status: "scheduled",
      },
    ],
  });

  return { seeded: true };
}
