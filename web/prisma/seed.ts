import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { setHours, setMinutes, startOfDay } from "date-fns";
import { stringifyModules, DEFAULT_ADMIN_MODULES } from "../src/lib/modules";
import { publicAppUrl } from "../src/lib/appUrl";

const prisma = new PrismaClient();

async function main() {
  await prisma.formSubmission.deleteMany();
  await prisma.formField.deleteMany();
  await prisma.formTemplate.deleteMany();
  await prisma.accessVisit.deleteMany();
  await prisma.robotCommand.deleteMany();
  await prisma.mapPlace.deleteMany();
  await prisma.operatorAlert.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.adminRobot.deleteMany();
  await prisma.robotSettings.deleteMany();
  await prisma.robot.deleteMany();
  await prisma.account.deleteMany();

  const hash = async (p: string) => bcrypt.hash(p, 10);

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
          bookingUrl: `${publicAppUrl()}/book/bob-demo-001`,
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

  console.log("Seed OK");
  console.log("  Super:  super@bobrobotics.com / super123");
  console.log("  Admin:  admin@bobrobotics.com / admin123  (già attivo)");
  console.log("  User:   mario@example.com / user123");
  console.log("  Robot:  bob-demo-001  serial SN-BOB-DEMO-001");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
