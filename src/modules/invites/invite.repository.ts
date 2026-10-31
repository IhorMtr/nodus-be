import { prisma } from '../../database/client.js';
import { Prisma } from '../../generated/prisma/client.js';

// ==================== SELECTS ====================

const inviteSelect = {
  id: true,
  workspaceId: true,
  createdById: true,
  expiresAt: true,
  usedAt: true,
  revokedAt: true,
  createdAt: true,
} satisfies Prisma.WorkspaceInviteSelect;

// ==================== DATABASE ACCESS ====================

function createInviteRepository(client: Prisma.TransactionClient) {
  function create(
    workspaceId: string,
    createdById: string,
    tokenHash: string,
    expiresAt: Date
  ) {
    return client.workspaceInvite.create({
      data: { workspaceId, createdById, tokenHash, expiresAt },
      select: inviteSelect,
    });
  }

  function list(workspaceId: string) {
    return client.workspaceInvite.findMany({
      where: { workspaceId },
      select: inviteSelect,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  }

  function findByHash(tokenHash: string) {
    return client.workspaceInvite.findUnique({
      where: { tokenHash },
      select: {
        ...inviteSelect,
        workspace: { select: { id: true, name: true } },
      },
    });
  }

  function findById(workspaceId: string, id: string) {
    return client.workspaceInvite.findFirst({
      where: { workspaceId, id },
      select: inviteSelect,
    });
  }

  async function claim(id: string, now: Date) {
    const result = await client.workspaceInvite.updateMany({
      where: { id, usedAt: null, revokedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    return result.count === 1;
  }

  async function revoke(workspaceId: string, id: string, now: Date) {
    const result = await client.workspaceInvite.updateMany({
      where: { workspaceId, id, usedAt: null, revokedAt: null },
      data: { revokedAt: now },
    });
    return result.count === 1;
  }

  function findMembership(workspaceId: string, userId: string) {
    return client.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      select: { userId: true },
    });
  }

  function addMember(workspaceId: string, userId: string) {
    return client.workspaceMember.create({
      data: { workspaceId, userId, role: 'Member' },
      select: { workspaceId: true, role: true },
    });
  }

  return {
    create,
    list,
    findByHash,
    findById,
    claim,
    revoke,
    findMembership,
    addMember,
  };
}

// ==================== PUBLIC API ====================

export type InviteRepository = ReturnType<typeof createInviteRepository>;
export const inviteRepository = createInviteRepository(prisma);

export function withInviteTransaction<T>(
  callback: (repository: InviteRepository) => Promise<T>
): Promise<T> {
  return prisma.$transaction(tx => callback(createInviteRepository(tx)));
}

export function isUniqueMembershipError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}
