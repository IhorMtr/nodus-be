export const QUEUE_NAMES = {
  announcements: 'announcements',
} as const satisfies Record<string, string>;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];
