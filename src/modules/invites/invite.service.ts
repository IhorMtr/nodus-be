import { createHash, randomBytes } from 'node:crypto';
import { requireWorkspaceRole } from '../workspaces/workspace.service.js';
import { inviteErrors } from './invite.errors.js';
import {
  inviteRepository,
  isUniqueMembershipError,
  withInviteTransaction,
  type InviteRepository,
} from './invite.repository.js';
import type {
  AcceptedInvite,
  CreatedInvite,
  PublicInvite,
  ResolvedInvite,
} from './invite.types.js';

// ==================== CONSTANTS ====================

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const INVITE_TOKEN_BYTES = 32;

// ==================== TYPES ====================

type InviteRecord = NonNullable<
  Awaited<ReturnType<InviteRepository['findById']>>
>;

// ==================== HELPERS ====================

function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function inviteStatus(invite: InviteRecord, now: Date): PublicInvite['status'] {
  if (invite.revokedAt) {
    return 'revoked';
  }
  if (invite.usedAt) {
    return 'used';
  }
  if (invite.expiresAt <= now) {
    return 'expired';
  }
  return 'active';
}

function assertRevocable(
  invite: InviteRecord | null
): asserts invite is InviteRecord {
  if (!invite) {
    throw inviteErrors.notFound();
  }
  if (invite.revokedAt) {
    throw inviteErrors.revoked();
  }
  if (invite.usedAt) {
    throw inviteErrors.alreadyUsed();
  }
}

function assertActive(
  invite: InviteRecord | null,
  now: Date
): asserts invite is InviteRecord {
  assertRevocable(invite);
  if (invite.expiresAt <= now) {
    throw inviteErrors.expired();
  }
}

// ==================== PUBLIC DATA ====================

function toPublicInvite(invite: InviteRecord, now: Date): PublicInvite {
  return {
    id: invite.id,
    workspaceId: invite.workspaceId,
    createdById: invite.createdById,
    expiresAt: invite.expiresAt.toISOString(),
    usedAt: invite.usedAt?.toISOString() ?? null,
    revokedAt: invite.revokedAt?.toISOString() ?? null,
    createdAt: invite.createdAt.toISOString(),
    status: inviteStatus(invite, now),
  };
}

// ==================== INVITE LIFECYCLE ====================

async function createInvite(
  workspaceId: string,
  userId: string
): Promise<CreatedInvite> {
  await requireWorkspaceRole(workspaceId, userId, ['Owner', 'Admin']);
  const token = randomBytes(INVITE_TOKEN_BYTES).toString('base64url');
  const now = new Date();
  const invite = await inviteRepository.create(
    workspaceId,
    userId,
    tokenHash(token),
    new Date(now.getTime() + INVITE_TTL_MS)
  );
  return { ...toPublicInvite(invite, now), token };
}

async function listInvites(
  workspaceId: string,
  userId: string
): Promise<PublicInvite[]> {
  await requireWorkspaceRole(workspaceId, userId, ['Owner', 'Admin']);
  const invites = await inviteRepository.list(workspaceId);
  const now = new Date();
  return invites.map(invite => toPublicInvite(invite, now));
}

async function resolveInvite(token: string): Promise<ResolvedInvite> {
  const invite = await inviteRepository.findByHash(tokenHash(token));
  assertActive(invite, new Date());
  return {
    id: invite.workspace.id,
    name: invite.workspace.name,
    expiresAt: invite.expiresAt.toISOString(),
  };
}

async function acceptInvite(
  token: string,
  userId: string
): Promise<AcceptedInvite> {
  try {
    return await withInviteTransaction(async repository => {
      const hash = tokenHash(token);
      const invite = await repository.findByHash(hash);
      const now = new Date();
      assertActive(invite, now);
      if (await repository.findMembership(invite.workspaceId, userId)) {
        throw inviteErrors.alreadyMember();
      }

      const claimed = await repository.claim(invite.id, now);
      if (!claimed) {
        assertActive(await repository.findByHash(hash), new Date());
        throw inviteErrors.alreadyUsed();
      }
      await repository.addMember(invite.workspaceId, userId);
      return { workspaceId: invite.workspaceId, role: 'Member' };
    });
  } catch (error) {
    if (isUniqueMembershipError(error)) {
      throw inviteErrors.alreadyMember();
    }
    throw error;
  }
}

async function revokeInvite(
  workspaceId: string,
  inviteId: string,
  userId: string
): Promise<void> {
  await requireWorkspaceRole(workspaceId, userId, ['Owner', 'Admin']);
  assertRevocable(await inviteRepository.findById(workspaceId, inviteId));

  const revoked = await inviteRepository.revoke(
    workspaceId,
    inviteId,
    new Date()
  );
  if (!revoked) {
    assertRevocable(await inviteRepository.findById(workspaceId, inviteId));
    throw inviteErrors.alreadyUsed();
  }
}

// ==================== PUBLIC API ====================

export const inviteService = {
  createInvite,
  listInvites,
  resolveInvite,
  acceptInvite,
  revokeInvite,
};
