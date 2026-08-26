-- Tipi visita, sale, durata e referente sugli appuntamenti
ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "hostUserId" TEXT;
ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "typeId" TEXT;
ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "roomId" TEXT;
ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "endsAt" TIMESTAMP(3);

UPDATE "Appointment"
SET "endsAt" = "startsAt" + INTERVAL '30 minutes'
WHERE "endsAt" IS NULL;

CREATE TABLE IF NOT EXISTS "AppointmentType" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "durationMinutes" INTEGER NOT NULL DEFAULT 30,
    "color" TEXT NOT NULL DEFAULT '#1a1a1a',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AppointmentType_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "MeetingRoom" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mapPlaceName" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MeetingRoom_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AppointmentTypeRoom" (
    "typeId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    CONSTRAINT "AppointmentTypeRoom_pkey" PRIMARY KEY ("typeId","roomId")
);

CREATE INDEX IF NOT EXISTS "Appointment_hostUserId_startsAt_idx" ON "Appointment"("hostUserId", "startsAt");
CREATE INDEX IF NOT EXISTS "Appointment_roomId_startsAt_idx" ON "Appointment"("roomId", "startsAt");
CREATE INDEX IF NOT EXISTS "Appointment_typeId_idx" ON "Appointment"("typeId");
CREATE INDEX IF NOT EXISTS "AppointmentType_adminId_active_idx" ON "AppointmentType"("adminId", "active");
CREATE INDEX IF NOT EXISTS "MeetingRoom_adminId_active_idx" ON "MeetingRoom"("adminId", "active");

DO $$ BEGIN
  ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_hostUserId_fkey"
    FOREIGN KEY ("hostUserId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_typeId_fkey"
    FOREIGN KEY ("typeId") REFERENCES "AppointmentType"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_roomId_fkey"
    FOREIGN KEY ("roomId") REFERENCES "MeetingRoom"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "AppointmentTypeRoom" ADD CONSTRAINT "AppointmentTypeRoom_typeId_fkey"
    FOREIGN KEY ("typeId") REFERENCES "AppointmentType"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "AppointmentTypeRoom" ADD CONSTRAINT "AppointmentTypeRoom_roomId_fkey"
    FOREIGN KEY ("roomId") REFERENCES "MeetingRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
