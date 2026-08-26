-- URL hub giochi (WebView robot)
ALTER TABLE "RobotSettings" ADD COLUMN IF NOT EXISTS "gamesUrl" TEXT NOT NULL DEFAULT 'https://robo-play-land.base44.app';
