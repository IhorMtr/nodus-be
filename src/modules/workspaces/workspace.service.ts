import type { WorkspaceRole } from '../../generated/prisma/client.js';
import { workspaceErrors } from './workspace.errors.js';
import {
  isWorkspaceConflictError,
  withWorkspaceTransaction,
  workspaceRepository,
  type WorkspaceRepository,
} from './workspace.repository.js';
import type {
  CreateWorkspaceInput,
  PublicWorkspace,
  PublicWorkspaceMember,
  UpdateMemberRoleInput,
  UpdateWorkspaceInput,
} from './workspace.types.js';

// ==================== PUBLIC DATA ====================

type WorkspaceRecord = Awaited<ReturnType<WorkspaceRepository['createWithOwner']>>;
type MemberRecord = NonNullable<Awaited<ReturnType<WorkspaceRepository['findMember']>>>;

function toPublicWorkspace(workspace: WorkspaceRecord, role: WorkspaceRole): PublicWorkspace {
  return {
    id: workspace.id,
    name: workspace.name,
    role,
    createdAt: workspace.createdAt.toISOString(),
    updatedAt: workspace.updatedAt.toISOString(),
  };
}

function toPublicMember(member: MemberRecord): PublicWorkspaceMember {
  return {
    userId: member.userId,
    firstName: member.user.firstName,
    lastName: member.user.lastName,
    email: member.user.email,
    role: member.role,
    joinedAt: member.createdAt.toISOString(),
  };
}

// ==================== AUTHORIZATION ====================

export async function requireWorkspaceMember(
  workspaceId: string,
  userId: string,
  repository: WorkspaceRepository = workspaceRepository,
) {
  const membership = await repository.findMembership(workspaceId, userId);
  if (!membership) throw workspaceErrors.notFound();
  return membership;
}

export async function requireWorkspaceRole(
  workspaceId: string,
  userId: string,
  roles: readonly WorkspaceRole[],
  repository: WorkspaceRepository = workspaceRepository,
) {
  const membership = await requireWorkspaceMember(workspaceId, userId, repository);
  if (!roles.includes(membership.role)) throw workspaceErrors.insufficientRole();
  return membership;
}

async function runWorkspaceTransaction<T>(operation: (repository: WorkspaceRepository) => Promise<T>): Promise<T> {
  try {
    return await withWorkspaceTransaction(operation);
  } catch (error) {
    if (isWorkspaceConflictError(error)) throw workspaceErrors.conflict();
    throw error;
  }
}

// ==================== WORKSPACE LIFECYCLE ====================

async function createWorkspace(userId: string, input: CreateWorkspaceInput): Promise<PublicWorkspace> {
  const workspace = await workspaceRepository.createWithOwner(userId, input.name);
  return toPublicWorkspace(workspace, 'Owner');
}

async function listWorkspaces(userId: string): Promise<PublicWorkspace[]> {
  const memberships = await workspaceRepository.findUserWorkspaces(userId);
  return memberships.map(({ workspace, role }) => toPublicWorkspace(workspace, role));
}

async function getWorkspace(workspaceId: string, userId: string): Promise<PublicWorkspace> {
  const membership = await requireWorkspaceMember(workspaceId, userId);
  return toPublicWorkspace(membership.workspace, membership.role);
}

async function updateWorkspace(workspaceId: string, userId: string, input: UpdateWorkspaceInput): Promise<PublicWorkspace> {
  return runWorkspaceTransaction(async (repository) => {
    const membership = await requireWorkspaceRole(workspaceId, userId, ['Owner', 'Admin'], repository);
    const workspace = await repository.updateWorkspace(workspaceId, input.name);
    return toPublicWorkspace(workspace, membership.role);
  });
}

async function deleteWorkspace(workspaceId: string, userId: string): Promise<void> {
  return runWorkspaceTransaction(async (repository) => {
    await requireWorkspaceRole(workspaceId, userId, ['Owner'], repository);
    await repository.deleteWorkspace(workspaceId);
  });
}

// ==================== MEMBERSHIP ====================

async function listMembers(workspaceId: string, userId: string): Promise<PublicWorkspaceMember[]> {
  return runWorkspaceTransaction(async (repository) => {
    await requireWorkspaceMember(workspaceId, userId, repository);
    const members = await repository.listMembers(workspaceId);
    return members.map(toPublicMember);
  });
}

async function updateMemberRole(
  workspaceId: string,
  userId: string,
  memberUserId: string,
  input: UpdateMemberRoleInput,
): Promise<PublicWorkspaceMember> {
  return runWorkspaceTransaction(async (repository) => {
    await requireWorkspaceRole(workspaceId, userId, ['Owner'], repository);
    const member = await repository.findMember(workspaceId, memberUserId);
    if (!member) throw workspaceErrors.memberNotFound();
    if (member.role === 'Owner') throw workspaceErrors.ownerProtected();

    const updated = await repository.updateMemberRole(workspaceId, memberUserId, member.role, input.role);
    if (!updated) throw workspaceErrors.conflict();
    return toPublicMember({ ...member, role: input.role });
  });
}

async function removeMember(workspaceId: string, userId: string, memberUserId: string): Promise<void> {
  return runWorkspaceTransaction(async (repository) => {
    const actor = await requireWorkspaceRole(workspaceId, userId, ['Owner', 'Admin'], repository);
    const member = await repository.findMember(workspaceId, memberUserId);
    if (!member) throw workspaceErrors.memberNotFound();
    if (member.role === 'Owner') throw workspaceErrors.ownerProtected();
    if (actor.userId === member.userId) throw workspaceErrors.cannotRemoveSelf();
    if (actor.role === 'Admin' && member.role !== 'Member') throw workspaceErrors.insufficientRole();

    const removed = await repository.removeMember(workspaceId, memberUserId, member.role);
    if (!removed) throw workspaceErrors.conflict();
  });
}

// ==================== PUBLIC API ====================

export const workspaceService = {
  createWorkspace,
  listWorkspaces,
  getWorkspace,
  updateWorkspace,
  deleteWorkspace,
  listMembers,
  updateMemberRole,
  removeMember,
};
