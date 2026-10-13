import type { z } from 'zod';
import type {
  channelParamsSchema,
  channelWorkspaceParamsSchema,
  createChannelSchema,
  updateChannelSchema,
} from './channel.schema.js';

export type CreateChannelInput = z.infer<typeof createChannelSchema>;
export type UpdateChannelInput = z.infer<typeof updateChannelSchema>;
export type ChannelWorkspaceParams = z.infer<typeof channelWorkspaceParamsSchema>;
export type ChannelParams = z.infer<typeof channelParamsSchema>;

export type PublicChannel = {
  id: string;
  workspaceId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};
