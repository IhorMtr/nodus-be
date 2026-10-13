import { workspaceErrors } from '../workspaces/workspace.errors.js';
import { requireWorkspaceMember, requireWorkspaceRole } from '../workspaces/workspace.service.js';
import { channelErrors } from './channel.errors.js';
import {
  channelRepository,
  isChannelNameConflictError,
  isChannelNotFoundError,
  isChannelWorkspaceMissingError,
  type ChannelRepository,
} from './channel.repository.js';
import type { CreateChannelInput, PublicChannel, UpdateChannelInput } from './channel.types.js';

// ==================== PUBLIC DATA ====================

type ChannelRecord = Awaited<ReturnType<ChannelRepository['createChannel']>>;

function toPublicChannel(channel: ChannelRecord): PublicChannel {
  return {
    id: channel.id,
    workspaceId: channel.workspaceId,
    name: channel.name,
    createdAt: channel.createdAt.toISOString(),
    updatedAt: channel.updatedAt.toISOString(),
  };
}

// ==================== CHANNEL LIFECYCLE ====================

async function createChannel(workspaceId: string, userId: string, input: CreateChannelInput): Promise<PublicChannel> {
  await requireWorkspaceRole(workspaceId, userId, ['Owner', 'Admin']);
  try {
    const channel = await channelRepository.createChannel(workspaceId, input.name);
    return toPublicChannel(channel);
  } catch (error) {
    if (isChannelNameConflictError(error)) throw channelErrors.nameAlreadyExists();
    if (isChannelWorkspaceMissingError(error)) throw workspaceErrors.notFound();
    throw error;
  }
}

async function listChannels(workspaceId: string, userId: string): Promise<PublicChannel[]> {
  await requireWorkspaceMember(workspaceId, userId);
  const channels = await channelRepository.listWorkspaceChannels(workspaceId);
  return channels.map(toPublicChannel);
}

async function getChannel(workspaceId: string, userId: string, channelId: string): Promise<PublicChannel> {
  await requireWorkspaceMember(workspaceId, userId);
  const channel = await channelRepository.findChannel(workspaceId, channelId);
  if (!channel) throw channelErrors.notFound();
  return toPublicChannel(channel);
}

async function updateChannel(
  workspaceId: string,
  userId: string,
  channelId: string,
  input: UpdateChannelInput,
): Promise<PublicChannel> {
  await requireWorkspaceRole(workspaceId, userId, ['Owner', 'Admin']);
  try {
    // The database scopes the write to the workspace and checks name uniqueness.
    const channel = await channelRepository.updateChannel(workspaceId, channelId, input.name);
    return toPublicChannel(channel);
  } catch (error) {
    if (isChannelNotFoundError(error)) throw channelErrors.notFound();
    if (isChannelNameConflictError(error)) throw channelErrors.nameAlreadyExists();
    throw error;
  }
}

async function deleteChannel(workspaceId: string, userId: string, channelId: string): Promise<void> {
  await requireWorkspaceRole(workspaceId, userId, ['Owner', 'Admin']);
  try {
    await channelRepository.deleteChannel(workspaceId, channelId);
  } catch (error) {
    if (isChannelNotFoundError(error)) throw channelErrors.notFound();
    throw error;
  }
}

// ==================== PUBLIC API ====================

export const channelService = { createChannel, listChannels, getChannel, updateChannel, deleteChannel };
