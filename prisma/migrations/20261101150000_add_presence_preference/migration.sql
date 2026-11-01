CREATE TYPE "PresencePreference" AS ENUM ('Online', 'Away', 'Dnd');
ALTER TABLE "User" ADD COLUMN "presencePreference" "PresencePreference" NOT NULL DEFAULT 'Online';
