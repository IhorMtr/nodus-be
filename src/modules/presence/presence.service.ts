import { randomUUID } from 'node:crypto';
import { logger } from '../../config/logger.js';
import {
  Prisma,
  type PresencePreference,
} from '../../generated/prisma/client.js';
import { redis } from '../../redis/client.js';
import { AppError } from '../../shared/errors/app-error.js';
import { socketPublisher } from '../../socket/socket.publisher.js';
import { presenceRepository } from './presence.repository.js';

// ==================== TYPES ====================

export type PresenceStatus = 'online' | 'away' | 'dnd' | 'offline';
export type PresenceUpdate = { userId: string; status: PresenceStatus };

type TransportUpdate = PresenceUpdate & { origin: string };

// ==================== CONSTANTS ====================

const channel = 'nodus:presence:updated';
const leaseMs = 90_000;
const refreshMs = 20_000;
const disconnectGraceMs = 2_500;

const connectScript = `
  redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ARGV[1])
  redis.call('ZADD', KEYS[1], ARGV[2], ARGV[3])
  redis.call('PEXPIRE', KEYS[1], ARGV[4])
  local first = redis.call('SET', KEYS[2], '1', 'PX', ARGV[4], 'NX')
  if not first then redis.call('PEXPIRE', KEYS[2], ARGV[4]) end
  redis.call('DEL', KEYS[3])
  return first and 1 or 0
`;

const disconnectScript = `
  redis.call('ZREM', KEYS[1], ARGV[1])
  if redis.call('ZCARD', KEYS[1]) == 0 then
    redis.call('SET', KEYS[2], '1', 'PX', ARGV[2])
  end
`;

const offlineScript = `
  redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ARGV[1])
  if redis.call('ZCARD', KEYS[1]) > 0 then return 0 end
  return redis.call('DEL', KEYS[2])
`;

// ==================== HELPERS ====================

function socketKey(userId: string): string {
  return `nodus:presence:sockets:${userId}`;
}

function visibleKey(userId: string): string {
  return `nodus:presence:visible:${userId}`;
}

function graceKey(userId: string): string {
  return `nodus:presence:grace:${userId}`;
}

function toStatus(preference: PresencePreference): PresenceStatus {
  return preference.toLowerCase() as PresenceStatus;
}

function toPreference(
  status: Exclude<PresenceStatus, 'offline'>
): PresencePreference {
  return (status[0]!.toUpperCase() + status.slice(1)) as PresencePreference;
}

// ==================== PRESENCE LIFECYCLE ====================

class PresenceService {
  #origin = randomUUID();
  #sockets = new Map<string, string>();
  #pending = new Map<string, ReturnType<typeof setTimeout>>();
  #offlineTasks = new Set<Promise<void>>();
  #refreshTimer: ReturnType<typeof setInterval> | undefined;
  #subscriber: ReturnType<typeof redis.duplicate> | undefined;

  async start(): Promise<void> {
    if (this.#subscriber) return;
    const subscriber = redis.duplicate();
    subscriber.on('error', error =>
      logger.error({ err: error }, 'Presence subscription failed')
    );
    subscriber.on('message', (_channel, message) => {
      try {
        const update = JSON.parse(message) as TransportUpdate;
        if (update.origin !== this.#origin) void this.#deliver(update);
      } catch (error) {
        logger.error({ err: error }, 'Invalid presence update');
      }
    });
    try {
      await subscriber.connect();
      await subscriber.subscribe(channel);
      this.#subscriber = subscriber;
      this.#refreshTimer = setInterval(() => {
        void this.#refresh();
      }, refreshMs);
    } catch (error) {
      subscriber.disconnect();
      throw error;
    }
  }

  async connect(userId: string, socketId: string): Promise<void> {
    this.#sockets.set(socketId, userId);
    const pending = this.#pending.get(userId);
    if (pending) {
      clearTimeout(pending);
      this.#pending.delete(userId);
    }
    try {
      const now = Date.now();
      const first = await redis.eval(
        connectScript,
        3,
        socketKey(userId),
        visibleKey(userId),
        graceKey(userId),
        now,
        now + leaseMs,
        socketId,
        leaseMs
      );
      if (Number(first) === 1) {
        const preference = await presenceRepository.findPreference(userId);
        if (preference)
          await this.#publish({
            userId,
            status: toStatus(preference.presencePreference),
          });
      }
    } catch (error) {
      logger.error({ err: error, userId }, 'Presence connect failed');
    }
  }

  async disconnect(socketId: string): Promise<void> {
    const userId = this.#sockets.get(socketId);
    if (!userId) return;
    this.#sockets.delete(socketId);
    try {
      await redis.eval(
        disconnectScript,
        2,
        socketKey(userId),
        graceKey(userId),
        socketId,
        disconnectGraceMs
      );
      if (this.#pending.has(userId)) return;
      const timer = setTimeout(() => {
        this.#pending.delete(userId);
        const task = this.#markOffline(userId);
        this.#offlineTasks.add(task);
        void task.finally(() => this.#offlineTasks.delete(task));
      }, disconnectGraceMs);
      this.#pending.set(userId, timer);
    } catch (error) {
      logger.error({ err: error, userId }, 'Presence disconnect failed');
    }
  }

  async close(): Promise<void> {
    if (this.#refreshTimer) clearInterval(this.#refreshTimer);
    this.#refreshTimer = undefined;
    await Promise.all([...this.#sockets.keys()].map(id => this.disconnect(id)));
    if (this.#pending.size > 0) {
      await new Promise(resolve => setTimeout(resolve, disconnectGraceMs + 50));
    }
    await Promise.all(this.#offlineTasks);
    const subscriber = this.#subscriber;
    this.#subscriber = undefined;
    if (subscriber?.status === 'ready') await subscriber.quit();
    else subscriber?.disconnect();
  }

  async #markOffline(userId: string): Promise<void> {
    try {
      const changed = await redis.eval(
        offlineScript,
        2,
        socketKey(userId),
        visibleKey(userId),
        Date.now()
      );
      if (Number(changed) === 1)
        await this.#publish({ userId, status: 'offline' });
    } catch (error) {
      logger.error(
        { err: error, userId },
        'Presence offline transition failed'
      );
    }
  }

  async #refresh(): Promise<void> {
    const now = Date.now();
    try {
      const pipeline = redis.pipeline();
      for (const [socketId, userId] of this.#sockets) {
        pipeline.zadd(socketKey(userId), 'XX', now + leaseMs, socketId);
        pipeline.pexpire(socketKey(userId), leaseMs);
        pipeline.pexpire(visibleKey(userId), leaseMs);
      }
      if (this.#sockets.size > 0) await pipeline.exec();
    } catch (error) {
      logger.error({ err: error }, 'Presence lease refresh failed');
    }
  }

  // ==================== STATUS ====================

  async setStatus(
    userId: string,
    status: Exclude<PresenceStatus, 'offline'>
  ): Promise<PresenceUpdate> {
    let updated;
    try {
      updated = await presenceRepository.setPreference(
        userId,
        toPreference(status)
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      )
        throw new AppError('User not found', 404, 'UserNotFound');
      throw error;
    }
    const effective = await this.get(userId, updated.presencePreference);
    if (effective.status !== 'offline') await this.#publish(effective);
    return effective;
  }

  async get(
    userId: string,
    preference?: PresencePreference
  ): Promise<PresenceUpdate> {
    const selected =
      preference ??
      (await presenceRepository.findPreference(userId))?.presencePreference;
    if (!selected) throw new AppError('User not found', 404, 'UserNotFound');
    const pipeline = redis.pipeline();
    pipeline.zcount(socketKey(userId), Date.now() + 1, '+inf');
    pipeline.exists(graceKey(userId));
    const results = await pipeline.exec();
    const online =
      Number(results?.[0]?.[1]) > 0 || Number(results?.[1]?.[1]) > 0;
    return { userId, status: online ? toStatus(selected) : 'offline' };
  }

  async getMany(userIds: string[]): Promise<Map<string, PresenceStatus>> {
    if (userIds.length === 0) return new Map();
    const preferences = await presenceRepository.findPreferences(userIds);
    const selected = new Map(
      preferences.map(user => [user.id, user.presencePreference])
    );
    const pipeline = redis.pipeline();
    const now = Date.now() + 1;
    for (const userId of userIds) {
      pipeline.zcount(socketKey(userId), now, '+inf');
      pipeline.exists(graceKey(userId));
    }
    const counts = await pipeline.exec();
    return new Map(
      userIds.map((userId, index) => [
        userId,
        Number(counts?.[index * 2]?.[1]) > 0 ||
        Number(counts?.[index * 2 + 1]?.[1]) > 0
          ? toStatus(selected.get(userId) ?? 'Online')
          : 'offline',
      ])
    );
  }

  // ==================== REALTIME ====================

  async #publish(update: PresenceUpdate): Promise<void> {
    await this.#deliver(update);
    try {
      await redis.publish(
        channel,
        JSON.stringify({
          ...update,
          origin: this.#origin,
        } satisfies TransportUpdate)
      );
    } catch (error) {
      logger.error(
        { err: error, userId: update.userId },
        'Presence publish failed'
      );
    }
  }

  async #deliver(update: PresenceUpdate): Promise<void> {
    try {
      const recipients = await presenceRepository.findVisibleUserIds(
        update.userId
      );
      socketPublisher.publishPresenceUpdated(update, recipients);
    } catch (error) {
      logger.error(
        { err: error, userId: update.userId },
        'Presence delivery failed'
      );
    }
  }
}

// ==================== PUBLIC API ====================

export const presenceService = new PresenceService();
