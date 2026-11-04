import type { z } from 'zod';
import type { PublicMessage } from '../messages/message.types.js';
import type { searchQuerySchema } from './search.schema.js';

// ==================== TYPES ====================

export type SearchQuery = z.infer<typeof searchQuerySchema>;

export type MessageSearchResult = {
  message: PublicMessage;
  channel: { id: string; name: string };
};

export type MessageSearchPage = {
  items: MessageSearchResult[];
  nextCursor: string | null;
};
