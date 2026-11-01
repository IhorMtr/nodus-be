import { presenceService } from '../presence/presence.service.js';
import { requireWorkspaceMember } from '../workspaces/workspace.service.js';
import { toPublicNotification } from '../notifications/notification.service.js';
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

// ==================== PUBLIC DATA ====================

export function toPublicDirectMessage(
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

async function toPublicConversations(
  records: ConversationRecord[],
  userId: string
): Promise<PublicConversation[]> {
  const otherIds = records.map(record =>
    record.firstUserId === userId ? record.secondUserId : record.firstUserId
  );
  const [statuses, unread] = await Promise.all([
    presenceService.getMany(otherIds),
    records.length
      ? conversationRepository.countUnread(records[0]!.workspaceId, userId)
      : Promise.resolve(new Map<string, number>()),
  ]);
  return records.map(record => {
    const other =
      record.firstUserId === userId ? record.secondUser : record.firstUser;
    const unreadCount = unread.get(record.id) ?? 0;
    return {
      id: record.id,
      workspaceId: record.workspaceId,
      otherUser: { ...other, status: statuses.get(other.id) ?? 'offline' },
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
      lastMessage: record.messages[0]
        ? toPublicDirectMessage(record.messages[0])
        : null,
      unreadCount,
      hasUnread: unreadCount > 0,
    };
  });
}

// ==================== AUTHORIZATION ====================

export async function requireConversation(
  workspaceId: string,
  userId: string,
  conversationId: string
) {
  await requireWorkspaceMember(workspaceId, userId);
  const record = await conversationRepository.find(conversationId, workspaceId);
  if (
    !record ||
    (record.firstUserId !== userId && record.secondUserId !== userId)
  )
    throw conversationErrors.notFound();
  return record;
}

// ==================== CONVERSATIONS ====================

async function create(
  workspaceId: string,
  userId: string,
  otherUserId: string
): Promise<{ conversation: PublicConversation; created: boolean }> {
  await requireWorkspaceMember(workspaceId, userId);
  if (userId === otherUserId) throw conversationErrors.self();
  const [firstUserId, secondUserId] = [userId, otherUserId].sort() as [
    string,
    string,
  ];
  const members = await conversationRepository.members(workspaceId, [
    firstUserId,
    secondUserId,
  ]);
  if (members.length !== 2) throw conversationErrors.participantNotFound();
  const id = await conversationRepository.createPair(
    workspaceId,
    firstUserId,
    secondUserId
  );
  const record = id
    ? await conversationRepository.find(id, workspaceId)
    : await conversationRepository.findPair(
        workspaceId,
        firstUserId,
        secondUserId
      );
  if (!record) throw conversationErrors.participantNotFound();
  return {
    conversation: (await toPublicConversations([record], userId))[0]!,
    created: id !== null,
  };
}

async function list(
  workspaceId: string,
  userId: string
): Promise<PublicConversation[]> {
  await requireWorkspaceMember(workspaceId, userId);
  const records = await conversationRepository.list(workspaceId, userId);
  return toPublicConversations(records, userId);
}

// ==================== MESSAGES ====================

async function sendMessage(
  workspaceId: string,
  userId: string,
  conversationId: string,
  content: string
) {
  const record = await requireConversation(workspaceId, userId, conversationId);
  const recipientId =
    record.firstUserId === userId ? record.secondUserId : record.firstUserId;
  const result = await conversationRepository.createMessage(
    workspaceId,
    conversationId,
    userId,
    recipientId,
    content
  );
  if (!result) throw conversationErrors.participantNotFound();
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
  await requireConversation(workspaceId, userId, conversationId);
  const messages = await conversationRepository.listMessages(
    conversationId,
    query
  );
  const page = messages.slice(0, query.limit);
  const oldest = page.at(-1);
  const nextCursor =
    messages.length > query.limit && oldest
      ? Buffer.from(
          JSON.stringify({
            createdAt: oldest.createdAt.toISOString(),
            id: oldest.id,
          })
        ).toString('base64url')
      : null;
  return { items: page.reverse().map(toPublicDirectMessage), nextCursor };
}

async function updateMessage(
  workspaceId: string,
  userId: string,
  conversationId: string,
  messageId: string,
  content: string
): Promise<PublicDirectMessage> {
  await requireConversation(workspaceId, userId, conversationId);
  const existing = await conversationRepository.findMessage(
    conversationId,
    messageId
  );
  if (!existing) throw conversationErrors.messageNotFound();
  if (existing.authorId !== userId) throw conversationErrors.authorOnly();
  const updated = await conversationRepository.updateMessage(
    conversationId,
    messageId,
    userId,
    content
  );
  if (!updated) throw conversationErrors.messageNotFound();
  return toPublicDirectMessage(updated);
}

async function deleteMessage(
  workspaceId: string,
  userId: string,
  conversationId: string,
  messageId: string
): Promise<void> {
  await requireConversation(workspaceId, userId, conversationId);
  const existing = await conversationRepository.findMessage(
    conversationId,
    messageId
  );
  if (!existing) throw conversationErrors.messageNotFound();
  if (existing.authorId !== userId) throw conversationErrors.authorOnly();
  if (
    !(await conversationRepository.deleteMessage(
      conversationId,
      messageId,
      userId
    ))
  )
    throw conversationErrors.messageNotFound();
}

// ==================== READ STATE ====================

async function markRead(
  workspaceId: string,
  userId: string,
  conversationId: string,
  messageId: string
): Promise<PublicConversationReadState> {
  await requireConversation(workspaceId, userId, conversationId);
  const message = await conversationRepository.findMessage(
    conversationId,
    messageId
  );
  if (!message) throw conversationErrors.messageNotFound();
  const advanced = await conversationRepository.advanceRead(
    workspaceId,
    userId,
    conversationId,
    messageId
  );
  const current =
    advanced ??
    (await conversationRepository.readState(userId, conversationId));
  if (!current) throw conversationErrors.notFound();
  return {
    lastReadMessageId: current.lastReadMessageId,
    lastReadAt: current.lastReadAt.toISOString(),
  };
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
