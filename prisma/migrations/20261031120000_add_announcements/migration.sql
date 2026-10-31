CREATE TABLE "Announcement" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "content" VARCHAR(4000) NOT NULL,
    "publishAt" TIMESTAMPTZ(3),
    "publishedAt" TIMESTAMPTZ(3),
    "scheduleVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Announcement_workspaceId_createdAt_id_idx" ON "Announcement"("workspaceId", "createdAt" DESC, "id" DESC);
CREATE INDEX "Announcement_workspaceId_publishedAt_createdAt_id_idx" ON "Announcement"("workspaceId", "publishedAt", "createdAt" DESC, "id" DESC);
CREATE INDEX "Announcement_publishedAt_publishAt_idx" ON "Announcement"("publishedAt", "publishAt");
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
