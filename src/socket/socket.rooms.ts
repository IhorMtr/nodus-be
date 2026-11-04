// ==================== ROOM NAMES ====================

export function userRoom(userId: string): string {
  return `user:${userId}`;
}

export function channelRoomPrefix(workspaceId: string): string {
  return `workspace:${workspaceId}:channel:`;
}

export function channelRoom(workspaceId: string, channelId: string): string {
  return `${channelRoomPrefix(workspaceId)}${channelId}`;
}

export function conversationRoomPrefix(workspaceId: string): string {
  return `workspace:${workspaceId}:conversation:`;
}

export function conversationRoom(
  workspaceId: string,
  conversationId: string
): string {
  return `${conversationRoomPrefix(workspaceId)}${conversationId}`;
}
