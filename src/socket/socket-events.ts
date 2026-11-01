// ==================== EVENT NAMES ====================

export const SOCKET_EVENTS = {
  CONNECTION: 'connection',
  DISCONNECT: 'disconnect',
  CHANNEL_JOIN: 'channel:join',
  CHANNEL_LEAVE: 'channel:leave',
  MESSAGE_CREATED: 'message:created',
  MESSAGE_UPDATED: 'message:updated',
  MESSAGE_DELETED: 'message:deleted',
  CONVERSATION_JOIN: 'conversation:join',
  CONVERSATION_LEAVE: 'conversation:leave',
  DIRECT_MESSAGE_CREATED: 'direct-message:created',
  DIRECT_MESSAGE_UPDATED: 'direct-message:updated',
  DIRECT_MESSAGE_DELETED: 'direct-message:deleted',
  WORKSPACE_ACCESS_REVOKED: 'workspace:access-revoked',
  NOTIFICATION_CREATED: 'notification:created',
  PRESENCE_UPDATED: 'presence:updated',
} as const;
