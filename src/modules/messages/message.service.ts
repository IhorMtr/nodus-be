import { requireChannel } from '../channels/channel.service.js';
import { requireWorkspaceMember } from '../workspaces/workspace.service.js';
import { channelReadStateRepository } from '../channels/channel-read-state.repository.js';
import { messageErrors } from './message.errors.js';
import {
  isMessageNotFoundError,
  isMessageRelationMissingError,
  messageRepository,
  type MessageRepository,
} from './message.repository.js';
import type {
  CreateMessageInput,
  MessageCursor,
  MessageContext,
  MessageHistory,
  MessageHistoryQuery,
  PublicMessage,
  UpdateMessageInput,
} from './message.types.js';

// ==================== PUBLIC DATA ====================

type MessageRecord = Awaited<ReturnType<MessageRepository['createMessage']>>;

function toPublicMessage(message: MessageRecord): PublicMessage {
  return {
    id: message.id,
    channelId: message.channelId,
    author: message.author,
    content: message.content,
    createdAt: message.createdAt.toISOString(),
    updatedAt: message.updatedAt.toISOString(),
  };
}

function encodeCursor(message: MessageCursor): string {
  return Buffer.from(
    JSON.stringify({
      createdAt: message.createdAt.toISOString(),
      id: message.id,
    })
  ).toString('base64url');
}

// ==================== AUTHORIZATION ====================

async function requireMessageAccess(
  workspaceId: string,
  userId: string,
  channelId: string
) {
  const membership = await requireWorkspaceMember(workspaceId, userId);
  await requireChannel(workspaceId, channelId);
  return membership;
}

async function requireMessage(channelId: string, messageId: string) {
  const message = await messageRepository.findMessage(channelId, messageId);
  if (!message) throw messageErrors.notFound();
  return message;
}

// ==================== MESSAGE LIFECYCLE ====================

async function createMessage(
  workspaceId: string,
  userId: string,
  channelId: string,
  input: CreateMessageInput
): Promise<PublicMessage> {
  await requireMessageAccess(workspaceId, userId, channelId);
  try {
    const message = await messageRepository.createMessage(
      channelId,
      userId,
      input.content
    );
    return toPublicMessage(message);
  } catch (error) {
    if (isMessageRelationMissingError(error)) {
      // Recheck access when a workspace or channel was deleted during the write.
      await requireMessageAccess(workspaceId, userId, channelId);
    }
    throw error;
  }
}

async function listMessages(
  workspaceId: string,
  userId: string,
  channelId: string,
  query: MessageHistoryQuery
): Promise<MessageHistory> {
  await requireMessageAccess(workspaceId, userId, channelId);
  const messages = await messageRepository.listChannelMessages(
    channelId,
    query
  );
  const page = messages.slice(0, query.limit);
  const hasMore = messages.length > query.limit;
  const ordered = query.after ? page : page.reverse();
  const nextCursor =
    !query.after && hasMore && ordered[0] ? encodeCursor(ordered[0]) : null;
  const previousCursor =
    query.after && hasMore && ordered.at(-1)
      ? encodeCursor(ordered.at(-1)!)
      : null;
  return {
    items: await withReceipts(channelId, ordered),
    nextCursor,
    previousCursor,
  };
}

// ==================== MESSAGE CONTEXT ====================

async function withReceipts(channelId: string, page: MessageRecord[]) {
  const readers = await channelReadStateRepository.receipts(
    channelId,
    page.map(message => message.id)
  );
  return page.map(message => {
    const item = toPublicMessage(message);
    const list = readers.get(item.id) ?? [];
    return {
      ...item,
      receipt: {
        read: list.length > 0,
        readerCount: list.length,
        readers: list,
      },
    };
  });
}

async function getMessageContext(
  workspaceId: string,
  userId: string,
  channelId: string,
  messageId: string
): Promise<MessageContext> {
  await requireMessageAccess(workspaceId, userId, channelId);
  const target = await requireMessage(channelId, messageId);
  const sideSize = 15;
  const [older, newer] = await Promise.all([
    messageRepository.listContextSide(channelId, target, 'older', sideSize),
    messageRepository.listContextSide(channelId, target, 'newer', sideSize),
  ]);
  const ordered = [
    ...older.slice(0, sideSize).reverse(),
    target,
    ...newer.slice(0, sideSize),
  ];
  return {
    targetMessageId: target.id,
    items: await withReceipts(channelId, ordered),
    olderCursor:
      older.length > sideSize && ordered[0] ? encodeCursor(ordered[0]) : null,
    newerCursor:
      newer.length > sideSize && ordered.at(-1)
        ? encodeCursor(ordered.at(-1)!)
        : null,
  };
}

async function updateMessage(
  workspaceId: string,
  userId: string,
  channelId: string,
  messageId: string,
  input: UpdateMessageInput
): Promise<PublicMessage> {
  await requireMessageAccess(workspaceId, userId, channelId);
  const message = await requireMessage(channelId, messageId);
  if (message.authorId !== userId) throw messageErrors.editForbidden();

  try {
    const updated = await messageRepository.updateMessage(
      channelId,
      messageId,
      input.content
    );
    return toPublicMessage(updated);
  } catch (error) {
    if (isMessageNotFoundError(error)) throw messageErrors.notFound();
    throw error;
  }
}

async function deleteMessage(
  workspaceId: string,
  userId: string,
  channelId: string,
  messageId: string
): Promise<void> {
  const membership = await requireMessageAccess(workspaceId, userId, channelId);
  const message = await requireMessage(channelId, messageId);
  if (
    message.authorId !== userId &&
    membership.role !== 'Owner' &&
    membership.role !== 'Admin'
  ) {
    throw messageErrors.deleteForbidden();
  }

  try {
    await messageRepository.deleteMessage(channelId, messageId);
  } catch (error) {
    if (isMessageNotFoundError(error)) throw messageErrors.notFound();
    throw error;
  }
}

// ==================== PUBLIC API ====================

export const messageService = {
  createMessage,
  listMessages,
  getMessageContext,
  updateMessage,
  deleteMessage,
};
