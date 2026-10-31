CREATE TYPE "NotificationType" AS ENUM ('AnnouncementPublished', 'WorkspaceRoleChanged', 'WorkspaceRemoved');

CREATE TABLE "Notification" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "type" "NotificationType" NOT NULL,
    "entityId" UUID,
    "title" VARCHAR(200) NOT NULL,
    "message" VARCHAR(4000) NOT NULL,
    "readAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Notification_userId_type_entityId_key" ON "Notification"("userId", "type", "entityId");
CREATE INDEX "Notification_userId_createdAt_id_idx" ON "Notification"("userId", "createdAt" DESC, "id" DESC);
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
