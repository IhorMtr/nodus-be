export const QUEUE_NAMES = {} as const satisfies Record<string, string>;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];
