import { AppError } from '../../shared/errors/app-error.js';

export const inviteErrors = {
  notFound: () => new AppError('Invite not found', 404, 'InviteNotFound'),
  expired: () => new AppError('Invite has expired', 410, 'InviteExpired'),
  revoked: () => new AppError('Invite has been revoked', 410, 'InviteRevoked'),
  alreadyUsed: () => new AppError('Invite has already been used', 409, 'InviteAlreadyUsed'),
  alreadyMember: () => new AppError('User is already a workspace member', 409, 'AlreadyWorkspaceMember'),
};
