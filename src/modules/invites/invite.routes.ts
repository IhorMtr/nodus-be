import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware.js';
import {
  validateBody,
  validateParams,
} from '../../middleware/validation.middleware.js';
import { noStore } from '../../middleware/no-store.middleware.js';
import { workspaceParamsSchema } from '../workspaces/workspace.schema.js';
import {
  acceptInvite,
  createInvite,
  listInvites,
  resolveInvite,
  revokeInvite,
} from './invite.controller.js';
import { inviteParamsSchema, inviteTokenSchema } from './invite.schema.js';

// ==================== PUBLIC INVITE ROUTES ====================

export const inviteRouter = Router();
export const workspaceInviteRouter = Router({ mergeParams: true });

inviteRouter.use(noStore);
inviteRouter.post('/resolve', validateBody(inviteTokenSchema), resolveInvite);
inviteRouter.post(
  '/accept',
  authenticate,
  validateBody(inviteTokenSchema),
  acceptInvite
);

// ==================== WORKSPACE INVITE ROUTES ====================

workspaceInviteRouter.use(authenticate);
workspaceInviteRouter.use(noStore);
workspaceInviteRouter.post(
  '/',
  validateParams(workspaceParamsSchema),
  createInvite
);
workspaceInviteRouter.get(
  '/',
  validateParams(workspaceParamsSchema),
  listInvites
);
workspaceInviteRouter.delete(
  '/:inviteId',
  validateParams(inviteParamsSchema),
  revokeInvite
);
