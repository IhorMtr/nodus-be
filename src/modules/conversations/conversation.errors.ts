import { AppError } from '../../shared/errors/app-error.js';

// ==================== ERRORS ====================

export const conversationErrors = {
  notFound: () =>
    new AppError('Conversation not found', 404, 'ConversationNotFound'),
  self: () =>
    new AppError(
      'Cannot start a conversation with yourself',
      400,
      'SelfConversation'
    ),
  participantNotFound: () =>
    new AppError('Workspace member not found', 404, 'MemberNotFound'),
  messageNotFound: () =>
    new AppError('Direct message not found', 404, 'DirectMessageNotFound'),
  authorOnly: () =>
    new AppError(
      'Only the author can change a direct message',
      403,
      'DirectMessageAuthorOnly'
    ),
};
