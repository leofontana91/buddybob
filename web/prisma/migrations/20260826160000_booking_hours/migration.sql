-- Orari prenotazione per sala + giorni globali
ALTER TABLE "RobotSettings" ADD COLUMN IF NOT EXISTS "bookableWeekdays" TEXT NOT NULL DEFAULT '1,2,3,4,5';
ALTER TABLE "MeetingRoom" ADD COLUMN IF NOT EXISTS "dayStart" TEXT;
ALTER TABLE "MeetingRoom" ADD COLUMN IF NOT EXISTS "dayEnd" TEXT;
ALTER TABLE "MeetingRoom" ADD COLUMN IF NOT EXISTS "weekdays" TEXT;
