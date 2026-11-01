import type { z } from 'zod';
import type { WorkspaceRole } from '../../generated/prisma/client.js';
import type { PresenceStatus } from '../presence/presence.service.js';
import type {
  createWorkspaceSchema,
  updateMemberRoleSchema,
  updateWorkspaceSchema,
  workspaceMemberParamsSchema,
  workspaceParamsSchema,
} from './workspace.schema.js';

// ==================== REQUEST TYPES ====================

export type CreateWorkspaceInput = z.infer<typeof createWorkspaceSchema>;
export type UpdateWorkspaceInput = z.infer<typeof updateWorkspaceSchema>;
export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>;
export type WorkspaceParams = z.infer<typeof workspaceParamsSchema>;
export type WorkspaceMemberParams = z.infer<typeof workspaceMemberParamsSchema>;

// ==================== RESPONSE TYPES ====================

export type PublicWorkspace = {
  id: string;
  name: string;
  role: WorkspaceRole;
  createdAt: string;
  updatedAt: string;
};

export type PublicWorkspaceMember = {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  role: WorkspaceRole;
  joinedAt: string;
  status: PresenceStatus;
};

// ==================== METRICS TYPES ====================

export type WorkspaceMetricsTotals = {
  members: number;
  channels: number;
  messages: number;
  directMessages: number;
  announcements: number;
  publishedAnnouncements: number;
};

export type WorkspaceActivityCounts = {
  messages: number;
  directMessages: number;
  announcements: number;
  activeMembers: number;
};

export type WorkspaceActivityPeriod = WorkspaceActivityCounts & {
  since: string;
};

export type WorkspaceMetrics = {
  generatedAt: string;
  totals: WorkspaceMetricsTotals;
  activity: {
    last7Days: WorkspaceActivityPeriod;
    last30Days: WorkspaceActivityPeriod;
  };
};
