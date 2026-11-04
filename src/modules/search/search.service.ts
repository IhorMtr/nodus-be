import { cursorOf } from '../../shared/pagination/cursor.js';
import { requireChannel } from '../channels/channel.service.js';
import { requireWorkspaceMember } from '../workspaces/workspace.service.js';
import { searchRepository, type SearchRecord } from './search.repository.js';
import type {
  MessageSearchPage,
  MessageSearchResult,
  SearchQuery,
} from './search.types.js';

// ==================== PUBLIC DATA ====================

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

// ==================== PUBLIC API ====================

async function searchMessages(
  workspaceId: string,
  userId: string,
  query: SearchQuery
): Promise<MessageSearchPage> {
  await requireWorkspaceMember(workspaceId, userId);
  if (query.channelId) {
    await requireChannel(workspaceId, query.channelId);
  }
  const records = await searchRepository.searchMessages(workspaceId, query);
  const hasMore = records.length > query.limit;
  const page = records.slice(0, query.limit);
  return {
    items: page.map(toResult),
    nextCursor: hasMore ? cursorOf(page.at(-1)) : null,
  };
}

export const searchService = { searchMessages };
