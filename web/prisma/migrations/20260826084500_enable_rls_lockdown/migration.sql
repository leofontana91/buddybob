-- Lock down Supabase Data API (PostgREST).
-- BuddyBOB accesses Postgres only via Prisma (DATABASE_URL as privileged role).
-- With RLS enabled and no policies for anon/authenticated, the public anon key
-- cannot read/write any row. Also revoke table grants from API roles.

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT c.relname AS tablename
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relname NOT LIKE 'pg_%'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',
      r.tablename
    );
  END LOOP;
END $$;

-- Deny Data API roles on existing tables
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT c.relname AS tablename
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
  LOOP
    EXECUTE format(
      'REVOKE ALL ON TABLE public.%I FROM anon, authenticated',
      r.tablename
    );
  END LOOP;
END $$;

REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;

-- New tables created later: no automatic API grants
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon, authenticated;

-- Explicit list (idempotent) for Prisma models — keeps advisor happy even if loop missed something
ALTER TABLE IF EXISTS public."Account" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."Robot" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."AdminRobot" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."RobotSettings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."Appointment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."OperatorAlert" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."PlaceContentGroup" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."MapPlace" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."RobotCommand" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."SavedPhrase" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."RobotTask" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."FormTemplate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."FormField" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."FormSubmission" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."AccessVisit" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."VoiceMemo" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."RobotAndroidRelease" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."GlobalAndroidRelease" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public."Account" FROM anon, authenticated;
REVOKE ALL ON TABLE public."Robot" FROM anon, authenticated;
REVOKE ALL ON TABLE public."AdminRobot" FROM anon, authenticated;
REVOKE ALL ON TABLE public."RobotSettings" FROM anon, authenticated;
REVOKE ALL ON TABLE public."Appointment" FROM anon, authenticated;
REVOKE ALL ON TABLE public."OperatorAlert" FROM anon, authenticated;
REVOKE ALL ON TABLE public."PlaceContentGroup" FROM anon, authenticated;
REVOKE ALL ON TABLE public."MapPlace" FROM anon, authenticated;
REVOKE ALL ON TABLE public."RobotCommand" FROM anon, authenticated;
REVOKE ALL ON TABLE public."SavedPhrase" FROM anon, authenticated;
REVOKE ALL ON TABLE public."RobotTask" FROM anon, authenticated;
REVOKE ALL ON TABLE public."FormTemplate" FROM anon, authenticated;
REVOKE ALL ON TABLE public."FormField" FROM anon, authenticated;
REVOKE ALL ON TABLE public."FormSubmission" FROM anon, authenticated;
REVOKE ALL ON TABLE public."AccessVisit" FROM anon, authenticated;
REVOKE ALL ON TABLE public."VoiceMemo" FROM anon, authenticated;
REVOKE ALL ON TABLE public."RobotAndroidRelease" FROM anon, authenticated;
REVOKE ALL ON TABLE public."GlobalAndroidRelease" FROM anon, authenticated;
