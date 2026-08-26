-- Email destinazione per compilazioni moduli
ALTER TABLE "FormTemplate" ADD COLUMN IF NOT EXISTS "notifyEmail" TEXT NOT NULL DEFAULT '';
