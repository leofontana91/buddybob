-- Accoglienza: frasi, sensibilità, punto standby, media idle
ALTER TABLE "RobotSettings" ADD COLUMN IF NOT EXISTS "welcomeSpeak" TEXT NOT NULL DEFAULT 'Benvenuto';
ALTER TABLE "RobotSettings" ADD COLUMN IF NOT EXISTS "howCanIHelpSpeak" TEXT NOT NULL DEFAULT 'Come posso aiutarti?';
ALTER TABLE "RobotSettings" ADD COLUMN IF NOT EXISTS "receptionCooldownSec" INTEGER NOT NULL DEFAULT 45;
ALTER TABLE "RobotSettings" ADD COLUMN IF NOT EXISTS "receptionDetectLevel" INTEGER NOT NULL DEFAULT 3;
ALTER TABLE "RobotSettings" ADD COLUMN IF NOT EXISTS "standbyPlace" TEXT NOT NULL DEFAULT '';
ALTER TABLE "RobotSettings" ADD COLUMN IF NOT EXISTS "idleDisplayText" TEXT NOT NULL DEFAULT '';
ALTER TABLE "RobotSettings" ADD COLUMN IF NOT EXISTS "idleMediaUrl" TEXT NOT NULL DEFAULT '';
ALTER TABLE "RobotSettings" ADD COLUMN IF NOT EXISTS "idleMediaContentType" TEXT NOT NULL DEFAULT '';
ALTER TABLE "RobotSettings" ADD COLUMN IF NOT EXISTS "idleMediaIntervalSec" INTEGER NOT NULL DEFAULT 20;
ALTER TABLE "RobotSettings" ADD COLUMN IF NOT EXISTS "idleMediaStopMode" TEXT NOT NULL DEFAULT 'person';
