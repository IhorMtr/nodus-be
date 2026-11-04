import type { ChannelReadPayload } from '../../socket/socket.types.js';
import { messageErrors } from '../messages/message.errors.js';
import { messageRepository } from '../messages/message.repository.js';
import { requireWorkspaceMember } from '../workspaces/workspace.service.js';
import { channelReadStateRepository } from './channel-read-state.repository.js';
import { channelErrors } from './channel.errors.js';
import { requireChannel } from './channel.service.js';
import type { PublicChannelReadState } from './channel.types.js';

// ==================== TYPES ====================

type ReadState = NonNullable<
  Awaited<ReturnType<typeof channelReadStateRepository.find>>
>;

type ChannelReadResult = {
  state: PublicChannelReadState;
  receipt: { payload: ChannelReadPayload; recipientIds: string[] } | null;
};

// ==================== PUBLIC DATA ====================

function toPublicReadState(state: ReadState): PublicChannelReadState {
  return {
    lastReadMessageId: state.lastReadMessageId,
    lastReadAt: state.lastReadAt.toISOString(),
  };
}

// ==================== REALTIME ====================

async function buildReceipt(
  workspaceId: string,
  userId: string,
  channelId: string,
  state: ReadState
): Promise<ChannelReadResult['receipt']> {
  const [reader, recipientIds] = await Promise.all([
    channelReadStateRepository.reader(userId),
    channelReadStateRepository.memberIds(workspaceId),
  ]);
  if (!reader || !recipientIds.includes(userId)) {
    return null;
  }
  return {
    payload: {
      workspaceId,
      channelId,
      reader,
      lastReadMessageId: state.lastReadMessageId,
      lastReadCreatedAt: state.lastReadCreatedAt.toISOString(),
    },
    recipientIds,
  };
}

// ==================== MUTATIONS ====================

async function markRead(
  workspaceId: string,
  userId: string,
  channelId: string,
  messageId: string
): Promise<ChannelReadResult> {
  await requireWorkspaceMember(workspaceId, userId);
  await requireChannel(workspaceId, channelId);
  const message = await messageRepository.findMessage(channelId, messageId);
  if (!message) {
    throw messageErrors.notFound();
  }

  const advanced = await channelReadStateRepository.advance(
    workspaceId,
    userId,
    channelId,
    messageId
  );
  if (advanced) {
    return {
      state: toPublicReadState(advanced),
      receipt: await buildReceipt(workspaceId, userId, channelId, advanced),
    };
  }

  const current = await channelReadStateRepository.find(userId, channelId);
  if (current) {
    return { state: toPublicReadState(current), receipt: null };
  }

  await requireWorkspaceMember(workspaceId, userId);
  await requireChannel(workspaceId, channelId);
  throw channelErrors.notFound();
}

// ==================== PUBLIC API ====================

export const channelReadStateService = { markRead };
