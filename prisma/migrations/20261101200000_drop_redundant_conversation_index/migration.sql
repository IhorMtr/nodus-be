-- The unique index on ("workspaceId", "firstUserId", "secondUserId") already covers this prefix.
DROP INDEX "Conversation_workspaceId_firstUserId_idx";
