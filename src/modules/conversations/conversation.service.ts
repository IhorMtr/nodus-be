import { cursorOf } from '../../shared/pagination/cursor.js';
import type {
  DirectReadPayload,
  NotificationsReadPayload,
} from '../../socket/socket.types.js';
import { toPublicNotification } from '../notifications/notification.service.js';
import type { PublicNotification } from '../notifications/notification.types.js';
import { presenceService } from '../presence/presence.service.js';
import { requireWorkspaceMember } from '../workspaces/workspace.service.js';
import { conversationErrors } from './conversation.errors.js';
import {
  conversationRepository,
  type ConversationRecord,
  type DirectMessageRecord,
} from './conversation.repository.js';
import type {
  DirectHistory,
  DirectHistoryQuery,
  PublicConversation,
  PublicConversationReadState,
  PublicDirectMessage,
} from './conversation.types.js';

// ==================== TYPES ====================

type ReadPosition = { lastReadCreatedAt: Date; lastReadMessageId: string };

type ConversationReadResult = {
  state: PublicConversationReadState;
  receipt: { payload: DirectReadPayload; recipientIds: string[] } | null;
  notificationsRead: NotificationsReadPayload | null;
};

// ==================== PUBLIC DATA ====================

function toPublicDirectMessage(
  message: DirectMessageRecord
): PublicDirectMessage {
  return {
    id: message.id,
    conversationId: message.conversationId,
    author: message.author,
    content: message.content,
    createdAt: message.createdAt.toISOString(),
    updatedAt: message.updatedAt.toISOString(),
  };
}

function otherParticipantId(record: ConversationRecord, userId: string) {
  return record.firstUserId === userId
    ? record.secondUserId
    : record.firstUserId;
}

async function toPublicConversations(
  workspaceId: string,
  records: ConversationRecord[],
  userId: string
): Promise<PublicConversation[]> {
  if (records.length === 0) {
    return [];
  }
  const [statuses, unread] = await Promise.all([
    presenceService.getMany(
      records.map(record => otherParticipantId(record, userId))
    ),
    conversationRepository.countUnread(workspaceId, userId),
  ]);
  return records.map(record => {
    const other =
      record.firstUserId === userId ? record.secondUser : record.firstUser;
    const unreadCount = unread.get(record.id) ?? 0;
    const lastMessage = record.messages[0];
    return {
      id: record.id,
      workspaceId: record.workspaceId,
      otherUser: { ...other, status: statuses.get(other.id) ?? 'offline' },
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
      lastMessage: lastMessage ? toPublicDirectMessage(lastMessage) : null,
      unreadCount,
      hasUnread: unreadCount > 0,
    };
  });
}

function isReadAt(message: DirectMessageRecord, position: ReadPosition | null) {
  if (!position) {
    return false;
  }
  const createdAt = message.createdAt.getTime();
  const readCreatedAt = position.lastReadCreatedAt.getTime();
  if (createdAt !== readCreatedAt) {
    return createdAt < readCreatedAt;
  }
  return message.id <= position.lastReadMessageId;
}

// ==================== AUTHORIZATION ====================

export async function requireConversation(
  workspaceId: string,
  userId: string,
  conversationId: string
) {
  await requireWorkspaceMember(workspaceId, userId);
  const record = await conversationRepository.find(conversationId, workspaceId);
  const isParticipant =
    record?.firstUserId === userId || record?.secondUserId === userId;
  if (!record || !isParticipant) {
    throw conversationErrors.notFound();
  }
  return record;
}

async function requireOwnMessage(
  conversationId: string,
  messageId: string,
  userId: string
) {
  const message = await conversationRepository.findMessage(
    conversationId,
    messageId
  );
  if (!message) {
    throw conversationErrors.messageNotFound();
  }
  if (message.authorId !== userId) {
    throw conversationErrors.authorOnly();
  }
  return message;
}

// ==================== CONVERSATIONS ====================

async function create(
  workspaceId: string,
  userId: string,
  otherUserId: string
): Promise<{ conversation: PublicConversation; created: boolean }> {
  await requireWorkspaceMember(workspaceId, userId);
  if (userId === otherUserId) {
    throw conversationErrors.self();
  }

  const [firstUserId, secondUserId] =
    userId < otherUserId ? [userId, otherUserId] : [otherUserId, userId];
  const members = await conversationRepository.members(workspaceId, [
    firstUserId,
    secondUserId,
  ]);
  if (members.length !== 2) {
    throw conversationErrors.participantNotFound();
  }

  const createdId = await conversationRepository.createPair(
    workspaceId,
    firstUserId,
    secondUserId
  );
  const record = createdId
    ? await conversationRepository.find(createdId, workspaceId)
    : await conversationRepository.findPair(
        workspaceId,
        firstUserId,
        secondUserId
      );
  if (!record) {
    throw conversationErrors.participantNotFound();
  }

  const [conversation] = await toPublicConversations(
    workspaceId,
    [record],
    userId
  );
  return { conversation: conversation!, created: createdId !== null };
}

async function list(
  workspaceId: string,
  userId: string
): Promise<PublicConversation[]> {
  await requireWorkspaceMember(workspaceId, userId);
  const records = await conversationRepository.list(workspaceId, userId);
  return toPublicConversations(workspaceId, records, userId);
}

// ==================== MESSAGES ====================

async function sendMessage(
  workspaceId: string,
  userId: string,
  conversationId: string,
  content: string
): Promise<{ message: PublicDirectMessage; notification: PublicNotification }> {
  const record = await requireConversation(workspaceId, userId, conversationId);
  const result = await conversationRepository.createMessage(
    workspaceId,
    conversationId,
    userId,
    otherParticipantId(record, userId),
    content
  );
  if (!result) {
    throw conversationErrors.participantNotFound();
  }
  return {
    message: toPublicDirectMessage(result.message),
    notification: toPublicNotification(result.notification),
  };
}

async function history(
  workspaceId: string,
  userId: string,
  conversationId: string,
  query: DirectHistoryQuery
): Promise<DirectHistory> {
  const record = await requireConversation(workspaceId, userId, conversationId);
  const [messages, recipientPosition] = await Promise.all([
    conversationRepository.listMessages(conversationId, query),
    conversationRepository.readState(
      otherParticipantId(record, userId),
      conversationId
    ),
  ]);
  const hasMore = messages.length > query.limit;
  const newestFirst = messages.slice(0, query.limit);
  const oldest = newestFirst.at(-1);

  return {
    items: newestFirst.reverse().map(message => {
      const item = toPublicDirectMessage(message);
      if (message.authorId !== userId) {
        return item;
      }
      return { ...item, read: isReadAt(message, recipientPosition) };
    }),
    nextCursor: hasMore ? cursorOf(oldest) : null,
  };
}

async function updateMessage(
  workspaceId: string,
  userId: string,
  conversationId: string,
  messageId: string,
  content: string
): Promise<PublicDirectMessage> {
  await requireConversation(workspaceId, userId, conversationId);
  await requireOwnMessage(conversationId, messageId, userId);
  const updated = await conversationRepository.updateMessage(
    conversationId,
    messageId,
    userId,
    content
  );
  if (!updated) {
    throw conversationErrors.messageNotFound();
  }
  return toPublicDirectMessage(updated);
}

async function deleteMessage(
  workspaceId: string,
  userId: string,
  conversationId: string,
  messageId: string
): Promise<void> {
  await requireConversation(workspaceId, userId, conversationId);
  await requireOwnMessage(conversationId, messageId, userId);
  const deleted = await conversationRepository.deleteMessage(
    conversationId,
    messageId,
    userId
  );
  if (!deleted) {
    throw conversationErrors.messageNotFound();
  }
}

// ==================== READ STATE ====================

async function markRead(
  workspaceId: string,
  userId: string,
  conversationId: string,
  messageId: string
): Promise<ConversationReadResult> {
  await requireConversation(workspaceId, userId, conversationId);
  const message = await conversationRepository.findMessage(
    conversationId,
    messageId
  );
  if (!message) {
    throw conversationErrors.messageNotFound();
  }

  const advanced = await conversationRepository.advanceRead(
    workspaceId,
    userId,
    conversationId,
    messageId
  );
  const current =
    advanced?.state ??
    (await conversationRepository.readState(userId, conversationId));
  if (!current) {
    throw conversationErrors.notFound();
  }
  const state: PublicConversationReadState = {
    lastReadMessageId: current.lastReadMessageId,
    lastReadCreatedAt: current.lastReadCreatedAt.toISOString(),
    lastReadAt: current.lastReadAt.toISOString(),
  };
  if (!advanced) {
    return { state, receipt: null, notificationsRead: null };
  }

  const recipientIds = await conversationRepository.activeParticipants(
    workspaceId,
    conversationId
  );
  const receipt = recipientIds.includes(userId)
    ? {
        payload: { workspaceId, conversationId, readerId: userId, ...state },
        recipientIds,
      }
    : null;
  const notificationsRead =
    advanced.notificationIds.length > 0
      ? {
          userId,
          notificationIds: advanced.notificationIds,
          unreadCount: advanced.unreadCount,
        }
      : null;
  return { state, receipt, notificationsRead };
}

// ==================== PUBLIC API ====================

export const conversationService = {
  create,
  list,
  sendMessage,
  history,
  updateMessage,
  deleteMessage,
  markRead,
};
