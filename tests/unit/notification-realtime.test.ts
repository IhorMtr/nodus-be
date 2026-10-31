import { describe, expect, it, vi } from 'vitest';
import { socketPublisher } from '../../src/socket/socket.publisher.js';
import type { SocketServer } from '../../src/socket/socket.types.js';

// ==================== REALTIME DELIVERY ====================

describe('notification realtime', () => {
  it('emits the committed notification only to the recipient room', () => {
    const emit = vi.fn();
    const to = vi.fn(() => ({ emit }));
    socketPublisher.bind({ to } as unknown as SocketServer);
    const notification = {
      id: 'notification-id',
      userId: 'user-id',
      workspaceId: 'workspace-id',
      type: 'AnnouncementPublished' as const,
      entityId: 'announcement-id',
      title: 'New announcement',
      message: 'Update',
      readAt: null,
      createdAt: '2026-10-31T00:00:00.000Z',
    };
    socketPublisher.publishNotificationCreated(notification);
    expect(to).toHaveBeenCalledWith('user:user-id');
    expect(emit).toHaveBeenCalledWith('notification:created', notification);
  });

  it('does not throw when Socket.IO delivery fails', () => {
    socketPublisher.bind({
      to: () => {
        throw new Error('Socket failure');
      },
    } as unknown as SocketServer);
    expect(() =>
      socketPublisher.publishNotificationCreated({
        id: 'notification-id',
        userId: 'user-id',
        workspaceId: 'workspace-id',
        type: 'WorkspaceRemoved',
        entityId: null,
        title: 'Removed',
        message: 'Removed',
        readAt: null,
        createdAt: '2026-10-31T00:00:00.000Z',
      })
    ).not.toThrow();
  });
});
