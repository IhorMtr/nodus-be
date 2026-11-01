CREATE TABLE "ChannelReadState" (
    "userId" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "channelId" UUID NOT NULL,
    "lastReadMessageId" UUID NOT NULL,
    "lastReadCreatedAt" TIMESTAMPTZ(3) NOT NULL,
    "lastReadAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "ChannelReadState_pkey" PRIMARY KEY ("userId","channelId")
);

CREATE INDEX "ChannelReadState_channelId_userId_idx" ON "ChannelReadState"("channelId", "userId");
CREATE UNIQUE INDEX "Channel_id_workspaceId_key" ON "Channel"("id", "workspaceId");

ALTER TABLE "ChannelReadState" ADD CONSTRAINT "ChannelReadState_workspaceId_userId_fkey" FOREIGN KEY ("workspaceId", "userId") REFERENCES "WorkspaceMember"("workspaceId", "userId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChannelReadState" ADD CONSTRAINT "ChannelReadState_channelId_workspaceId_fkey" FOREIGN KEY ("channelId", "workspaceId") REFERENCES "Channel"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;
