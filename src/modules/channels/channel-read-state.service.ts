import { requireWorkspaceMember } from '../workspaces/workspace.service.js';
import { messageErrors } from '../messages/message.errors.js';
import { messageRepository } from '../messages/message.repository.js';
import { channelErrors } from './channel.errors.js';
import { channelReadStateRepository } from './channel-read-state.repository.js';
import { requireChannel } from './channel.service.js';
import type { PublicChannelReadState } from './channel.types.js';

// ==================== PUBLIC DATA ====================

type ReadState = NonNullable<
  Awaited<ReturnType<typeof channelReadStateRepository.find>>
>;

function toPublicReadState(state: ReadState): PublicChannelReadState {
  return {
    lastReadMessageId: state.lastReadMessageId,
    lastReadAt: state.lastReadAt.toISOString(),
  };
}

// ==================== MUTATIONS ====================

async function markRead(
  workspaceId: string,
  userId: string,
  channelId: string,
  messageId: string
): Promise<PublicChannelReadState> {
  await requireWorkspaceMember(workspaceId, userId);
  await requireChannel(workspaceId, channelId);
  const message = await messageRepository.findMessage(channelId, messageId);
  if (!message) throw messageErrors.notFound();

  const advanced = await channelReadStateRepository.advance(
    workspaceId,
    userId,
    channelId,
    messageId
  );
  if (advanced) return toPublicReadState(advanced);

  // A repeated or older boundary leaves the stored position unchanged.
  const current = await channelReadStateRepository.find(userId, channelId);
  if (current) return toPublicReadState(current);
  await requireWorkspaceMember(workspaceId, userId);
  await requireChannel(workspaceId, channelId);
  throw channelErrors.notFound();
}

// ==================== PUBLIC API ====================

export const channelReadStateService = { markRead };
