import { workspaceMetricsRepository } from './workspace-metrics.repository.js';
import { requireWorkspaceRole } from './workspace.service.js';
import type {
  WorkspaceActivityCounts,
  WorkspaceActivityPeriod,
  WorkspaceMetrics,
} from './workspace.types.js';

// ==================== PERIODS ====================

const dayMs = 24 * 60 * 60 * 1000;

const activityPeriodDays = {
  last7Days: 7,
  last30Days: 30,
} as const satisfies Record<keyof WorkspaceMetrics['activity'], number>;

// Periods are rolling windows ending at the request time, not calendar days.
function periodStart(now: Date, days: number): Date {
  return new Date(now.getTime() - days * dayMs);
}

function toActivityPeriod(
  counts: WorkspaceActivityCounts,
  since: Date
): WorkspaceActivityPeriod {
  return { since: since.toISOString(), ...counts };
}

// ==================== PUBLIC API ====================

async function get(
  workspaceId: string,
  userId: string
): Promise<WorkspaceMetrics> {
  await requireWorkspaceRole(workspaceId, userId, ['Owner', 'Admin']);
  const now = new Date();
  const since = {
    last7Days: periodStart(now, activityPeriodDays.last7Days),
    last30Days: periodStart(now, activityPeriodDays.last30Days),
  };
  const { totals, activity } = await workspaceMetricsRepository.collect(
    workspaceId,
    since
  );
  return {
    generatedAt: now.toISOString(),
    totals,
    activity: {
      last7Days: toActivityPeriod(activity.last7Days, since.last7Days),
      last30Days: toActivityPeriod(activity.last30Days, since.last30Days),
    },
  };
}

export const workspaceMetricsService = { get };
