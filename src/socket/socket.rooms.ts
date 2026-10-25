// Room names are case sensitive; callers pass UUIDs already normalized to lowercase.

export function userRoom(userId: string): string {
  return `user:${userId}`;
}

export function channelRoomPrefix(workspaceId: string): string {
  return `workspace:${workspaceId}:channel:`;
}

export function channelRoom(workspaceId: string, channelId: string): string {
  return `${channelRoomPrefix(workspaceId)}${channelId}`;
}
