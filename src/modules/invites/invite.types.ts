import type { z } from 'zod';
import type { inviteParamsSchema, inviteTokenSchema } from './invite.schema.js';

// ==================== REQUEST TYPES ====================

export type InviteTokenInput = z.infer<typeof inviteTokenSchema>;
export type InviteParams = z.infer<typeof inviteParamsSchema>;

// ==================== RESPONSE TYPES ====================

export type PublicInvite = {
  id: string;
  workspaceId: string;
  createdById: string;
  expiresAt: string;
  usedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  status: 'active' | 'used' | 'revoked' | 'expired';
};

export type CreatedInvite = PublicInvite & { token: string };
export type ResolvedInvite = { id: string; name: string; expiresAt: string };
export type AcceptedInvite = { workspaceId: string; role: 'Member' };
