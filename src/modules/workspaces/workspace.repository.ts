import { prisma } from '../../database/client.js';
import { Prisma, WorkspaceRole } from '../../generated/prisma/client.js';

// ==================== SELECTS ====================

const workspaceSelect = {
  id: true,
  name: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.WorkspaceSelect;

const memberSelect = {
  userId: true,
  role: true,
  createdAt: true,
  user: { select: { firstName: true, lastName: true, email: true } },
} satisfies Prisma.WorkspaceMemberSelect;

const maxTransactionAttempts = 3;

// ==================== DATABASE ACCESS ====================

function createWorkspaceRepository(client: Prisma.TransactionClient) {
  function createWithOwner(userId: string, name: string) {
    return client.workspace.create({
      data: {
        name,
        members: { create: { userId, role: WorkspaceRole.Owner } },
      },
      select: workspaceSelect,
    });
  }

  function findUserWorkspaces(userId: string) {
    return client.workspaceMember.findMany({
      where: { userId },
      select: { role: true, workspace: { select: workspaceSelect } },
      orderBy: [
        { workspace: { createdAt: 'desc' } },
        { workspace: { id: 'desc' } },
      ],
    });
  }

  function findMembership(workspaceId: string, userId: string) {
    return client.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      select: { userId: true, role: true, workspace: { select: workspaceSelect } },
    });
  }

  function updateWorkspace(workspaceId: string, name: string) {
    return client.workspace.update({
      where: { id: workspaceId },
      data: { name },
      select: workspaceSelect,
    });
  }

  async function deleteWorkspace(workspaceId: string): Promise<void> {
    await client.workspace.delete({ where: { id: workspaceId }, select: { id: true } });
  }

  function listMembers(workspaceId: string) {
    return client.workspaceMember.findMany({
      where: { workspaceId },
      select: memberSelect,
      orderBy: [{ createdAt: 'asc' }, { userId: 'asc' }],
    });
  }

  function findMember(workspaceId: string, userId: string) {
    return client.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      select: memberSelect,
    });
  }

  async function updateMemberRole(
    workspaceId: string,
    userId: string,
    expectedRole: WorkspaceRole,
    role: WorkspaceRole,
  ): Promise<boolean> {
    const result = await client.workspaceMember.updateMany({
      where: { workspaceId, userId, role: expectedRole },
      data: { role },
    });
    return result.count === 1;
  }

  async function removeMember(
    workspaceId: string,
    userId: string,
    expectedRole: WorkspaceRole,
  ): Promise<boolean> {
    const result = await client.workspaceMember.deleteMany({
      where: { workspaceId, userId, role: expectedRole },
    });
    return result.count === 1;
  }

  return {
    createWithOwner,
    findUserWorkspaces,
    findMembership,
    updateWorkspace,
    deleteWorkspace,
    listMembers,
    findMember,
    updateMemberRole,
    removeMember,
  };
}

// ==================== TRANSACTIONS ====================

export function isWorkspaceConflictError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034';
}

export async function withWorkspaceTransaction<T>(
  callback: (repository: WorkspaceRepository) => Promise<T>,
): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await prisma.$transaction(
        (transaction) => callback(createWorkspaceRepository(transaction)),
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (!isWorkspaceConflictError(error) || attempt >= maxTransactionAttempts) {
        throw error;
      }
    }
  }
}

// ==================== PUBLIC API ====================

export type WorkspaceRepository = ReturnType<typeof createWorkspaceRepository>;

export const workspaceRepository = createWorkspaceRepository(prisma);
