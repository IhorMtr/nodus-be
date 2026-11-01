import type { z } from 'zod';
import type {
  channelParamsSchema,
  channelWorkspaceParamsSchema,
  createChannelSchema,
  markChannelReadSchema,
  updateChannelSchema,
} from './channel.schema.js';

// ==================== REQUEST TYPES ====================

export type CreateChannelInput = z.infer<typeof createChannelSchema>;
export type UpdateChannelInput = z.infer<typeof updateChannelSchema>;
export type MarkChannelReadInput = z.infer<typeof markChannelReadSchema>;
export type ChannelWorkspaceParams = z.infer<
  typeof channelWorkspaceParamsSchema
>;
export type ChannelParams = z.infer<typeof channelParamsSchema>;

// ==================== RESPONSE TYPES ====================

export type PublicChannel = {
  id: string;
  workspaceId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type PublicChannelWithUnread = PublicChannel & {
  unreadCount: number;
  hasUnread: boolean;
};

export type PublicChannelReadState = {
  lastReadMessageId: string;
  lastReadAt: string;
};
