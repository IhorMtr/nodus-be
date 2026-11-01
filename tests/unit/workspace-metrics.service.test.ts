import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ==================== MOCKS ====================

const mocks = vi.hoisted(() => ({
  requireWorkspaceRole: vi.fn(),
  collect: vi.fn(),
}));

vi.mock('../../src/modules/workspaces/workspace.service.js', () => ({
  requireWorkspaceRole: mocks.requireWorkspaceRole,
}));
vi.mock('../../src/modules/workspaces/workspace-metrics.repository.js', () => ({
  workspaceMetricsRepository: { collect: mocks.collect },
}));

const { workspaceMetricsService } =
  await import('../../src/modules/workspaces/workspace-metrics.service.js');

// ==================== FIXTURES ====================

const now = new Date('2026-11-01T12:00:00.000Z');
const totals = {
  members: 3,
  channels: 2,
  messages: 10,
  directMessages: 4,
  announcements: 2,
  publishedAnnouncements: 1,
};
const counts = (value: number) => ({
  messages: value,
  directMessages: value,
  announcements: value,
  activeMembers: value,
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  mocks.requireWorkspaceRole.mockReset().mockResolvedValue(undefined);
  mocks.collect.mockReset().mockResolvedValue({
    totals,
    activity: { last7Days: counts(1), last30Days: counts(2) },
  });
});

afterEach(() => vi.useRealTimers());

// ==================== METRICS ====================

describe('workspace metrics service', () => {
  it('requires Owner or Admin and queries rolling 7 and 30 day windows', async () => {
    const result = await workspaceMetricsService.get('workspace-id', 'user-id');

    expect(mocks.requireWorkspaceRole).toHaveBeenCalledWith(
      'workspace-id',
      'user-id',
      ['Owner', 'Admin']
    );
    expect(mocks.collect).toHaveBeenCalledWith('workspace-id', {
      last7Days: new Date('2026-10-25T12:00:00.000Z'),
      last30Days: new Date('2026-10-02T12:00:00.000Z'),
    });
    expect(result).toEqual({
      generatedAt: '2026-11-01T12:00:00.000Z',
      totals,
      activity: {
        last7Days: { since: '2026-10-25T12:00:00.000Z', ...counts(1) },
        last30Days: { since: '2026-10-02T12:00:00.000Z', ...counts(2) },
      },
    });
  });

  it('does not query metrics when authorization fails', async () => {
    const denied = new Error('denied');
    mocks.requireWorkspaceRole.mockRejectedValue(denied);

    await expect(
      workspaceMetricsService.get('workspace-id', 'user-id')
    ).rejects.toBe(denied);
    expect(mocks.collect).not.toHaveBeenCalled();
  });
});
