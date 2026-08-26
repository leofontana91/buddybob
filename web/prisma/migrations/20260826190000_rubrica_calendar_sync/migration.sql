-- Rubrica ospiti + sync calendario
ALTER TABLE "RobotSettings" ADD COLUMN IF NOT EXISTS "rubricaEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "RobotSettings" ADD COLUMN IF NOT EXISTS "rubricaCollectPhone" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "RobotSettings" ADD COLUMN IF NOT EXISTS "rubricaCollectEmail" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "RobotSettings" ADD COLUMN IF NOT EXISTS "rubricaCollectCompany" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "RobotSettings" ADD COLUMN IF NOT EXISTS "rubricaCollectNotes" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "RobotSettings" ADD COLUMN IF NOT EXISTS "calendarSyncProvider" TEXT NOT NULL DEFAULT 'none';
ALTER TABLE "RobotSettings" ADD COLUMN IF NOT EXISTS "calendarSyncEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "RobotSettings" ADD COLUMN IF NOT EXISTS "calendarSyncIcalUrl" TEXT NOT NULL DEFAULT '';
ALTER TABLE "RobotSettings" ADD COLUMN IF NOT EXISTS "calendarLastSyncAt" TIMESTAMP(3);

ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "externalId" TEXT;
ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "externalSource" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Appointment_robotId_externalSource_externalId_key"
  ON "Appointment"("robotId", "externalSource", "externalId");

CREATE TABLE IF NOT EXISTS "GuestContact" (
  "id" TEXT NOT NULL,
  "adminId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "phone" TEXT NOT NULL DEFAULT '',
  "email" TEXT NOT NULL DEFAULT '',
  "company" TEXT NOT NULL DEFAULT '',
  "notes" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3),
  CONSTRAINT "GuestContact_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "GuestContact_adminId_name_idx" ON "GuestContact"("adminId", "name");
CREATE INDEX IF NOT EXISTS "GuestContact_adminId_phone_idx" ON "GuestContact"("adminId", "phone");
CREATE INDEX IF NOT EXISTS "GuestContact_adminId_email_idx" ON "GuestContact"("adminId", "email");
