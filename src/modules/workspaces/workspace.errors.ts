import { AppError } from '../../shared/errors/app-error.js';

export const workspaceErrors = {
  notFound: () => new AppError('Workspace not found', 404, 'WorkspaceNotFound'),
  insufficientRole: () => new AppError('Workspace role does not allow this operation', 403, 'InsufficientWorkspaceRole'),
  memberNotFound: () => new AppError('Workspace member not found', 404, 'MemberNotFound'),
  ownerProtected: () => new AppError('Workspace owner cannot be changed or removed', 403, 'OwnerRoleProtected'),
  cannotRemoveSelf: () => new AppError('Self removal is not supported', 403, 'CannotRemoveSelf'),
  conflict: () => new AppError('Workspace changed concurrently; retry the request', 409, 'WorkspaceConflict'),
};
