-- Referente aziendale per controllo accessi
ALTER TABLE "AccessVisit" ADD COLUMN IF NOT EXISTS "hostUserId" TEXT;
ALTER TABLE "AccessVisit" ADD COLUMN IF NOT EXISTS "hostName" TEXT NOT NULL DEFAULT '';
