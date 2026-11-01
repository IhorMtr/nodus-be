import { requireChannel } from '../channels/channel.service.js';
import { requireWorkspaceMember } from '../workspaces/workspace.service.js';
import { searchRepository, type SearchRecord } from './search.repository.js';
import type {
  MessageSearchPage,
  MessageSearchResult,
  SearchQuery,
} from './search.types.js';

// ==================== SEARCH ====================

function toResult(record: SearchRecord): MessageSearchResult {
  return {
    message: {
      id: record.id,
      channelId: record.channelId,
      author: record.author,
      content: record.content,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    },
    channel: record.channel,
  };
}

// ==================== PAGINATION ====================

function encodeCursor(record: SearchRecord): string {
  return Buffer.from(
    JSON.stringify({ createdAt: record.createdAt.toISOString(), id: record.id })
  ).toString('base64url');
}

// ==================== PUBLIC API ====================

async function searchMessages(
  workspaceId: string,
  userId: string,
  query: SearchQuery
): Promise<MessageSearchPage> {
  await requireWorkspaceMember(workspaceId, userId);
  if (query.channelId) await requireChannel(workspaceId, query.channelId);
  const records = await searchRepository.searchMessages(workspaceId, query);
  const page = records.slice(0, query.limit);
  const last = page.at(-1);
  return {
    items: page.map(toResult),
    nextCursor:
      records.length > query.limit && last ? encodeCursor(last) : null,
  };
}

export const searchService = { searchMessages };
