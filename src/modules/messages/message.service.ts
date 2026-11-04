import { cursorOf } from '../../shared/pagination/cursor.js';
import { channelReadStateRepository } from '../channels/channel-read-state.repository.js';
import { requireChannel } from '../channels/channel.service.js';
import { requireWorkspaceMember } from '../workspaces/workspace.service.js';
import { messageErrors } from './message.errors.js';
import {
  isMessageNotFoundError,
  isMessageRelationMissingError,
  messageRepository,
  type MessageRepository,
} from './message.repository.js';
import type {
  CreateMessageInput,
  MessageContext,
  MessageHistory,
  MessageHistoryQuery,
  PublicMessage,
  UpdateMessageInput,
} from './message.types.js';

// ==================== CONSTANTS ====================

const CONTEXT_SIDE_SIZE = 15;

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

async function withReceipts(
  channelId: string,
  messages: MessageRecord[]
): Promise<PublicMessage[]> {
  const readers = await channelReadStateRepository.receipts(
    channelId,
    messages.map(message => message.id)
  );
  return messages.map(message => {
    const messageReaders = readers.get(message.id) ?? [];
    return {
      ...toPublicMessage(message),
      receipt: {
        read: messageReaders.length > 0,
        readerCount: messageReaders.length,
        readers: messageReaders,
      },
    };
  });
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
  if (!message) {
    throw messageErrors.notFound();
  }
  return message;
}

// ==================== QUERIES ====================

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
  const hasMore = messages.length > query.limit;
  const page = messages.slice(0, query.limit);

  const ordered = query.after ? page : page.reverse();
  const nextCursor = !query.after && hasMore ? cursorOf(ordered[0]) : null;
  const previousCursor =
    query.after && hasMore ? cursorOf(ordered.at(-1)) : null;

  return {
    items: await withReceipts(channelId, ordered),
    nextCursor,
    previousCursor,
  };
}

async function getMessageContext(
  workspaceId: string,
  userId: string,
  channelId: string,
  messageId: string
): Promise<MessageContext> {
  await requireMessageAccess(workspaceId, userId, channelId);
  const target = await requireMessage(channelId, messageId);
  const [older, newer] = await Promise.all([
    messageRepository.listContextSide(
      channelId,
      target,
      'older',
      CONTEXT_SIDE_SIZE
    ),
    messageRepository.listContextSide(
      channelId,
      target,
      'newer',
      CONTEXT_SIDE_SIZE
    ),
  ]);
  const ordered = [
    ...older.slice(0, CONTEXT_SIDE_SIZE).reverse(),
    target,
    ...newer.slice(0, CONTEXT_SIDE_SIZE),
  ];
  const hasOlder = older.length > CONTEXT_SIDE_SIZE;
  const hasNewer = newer.length > CONTEXT_SIDE_SIZE;

  return {
    targetMessageId: target.id,
    items: await withReceipts(channelId, ordered),
    olderCursor: hasOlder ? cursorOf(ordered[0]) : null,
    newerCursor: hasNewer ? cursorOf(ordered.at(-1)) : null,
  };
}

// ==================== MUTATIONS ====================

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
      await requireMessageAccess(workspaceId, userId, channelId);
    }
    throw error;
  }
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
  if (message.authorId !== userId) {
    throw messageErrors.editForbidden();
  }

  try {
    const updated = await messageRepository.updateMessage(
      channelId,
      messageId,
      input.content
    );
    return toPublicMessage(updated);
  } catch (error) {
    if (isMessageNotFoundError(error)) {
      throw messageErrors.notFound();
    }
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
  const isAuthor = message.authorId === userId;
  const isModerator =
    membership.role === 'Owner' || membership.role === 'Admin';
  if (!isAuthor && !isModerator) {
    throw messageErrors.deleteForbidden();
  }

  try {
    await messageRepository.deleteMessage(channelId, messageId);
  } catch (error) {
    if (isMessageNotFoundError(error)) {
      throw messageErrors.notFound();
    }
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
