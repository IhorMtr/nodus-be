import { SOCKET_EVENTS } from '../socket/socket-events.js';
import { channelRoom, channelRoomPrefix, userRoom } from '../socket/socket.rooms.js';
import type { ClientToServerEvents, ServerToClientEvents } from '../socket/socket.types.js';

// ==================== CONSTANTS ====================

const PRODUCTION_HOST = 'nodus-be.onrender.com';
// initializeSocket does not set a custom path, so Socket.IO uses its default.
const SOCKET_IO_PATH = '/socket.io/';

const USER_ROOM = userRoom('{userId}');
const CHANNEL_ROOM = channelRoom('{workspaceId}', '{channelId}');
const WORKSPACE_CHANNEL_ROOMS = `${channelRoomPrefix('{workspaceId}')}*`;

const EXAMPLE_IDS = {
  workspace: '8f5d3c1a-2b4e-4f6a-9c7d-1e0a2b3c4d5e',
  channel: 'b7a1e2d4-5c6f-4a8b-8d9e-0f1a2b3c4d5e',
  message: '1c2d3e4f-5a6b-4c7d-8e9f-a0b1c2d3e4f5',
  user: '6e7f8a9b-0c1d-4e2f-a3b4-c5d6e7f8a9b0',
};

// ==================== HELPERS ====================

// The helpers fail to compile when an event is documented in the wrong direction or does not exist.
const received = <E extends keyof ClientToServerEvents>(event: E): E => event;
const sent = <E extends keyof ServerToClientEvents>(event: E): E => event;

const schemaRef = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const messageRef = (name: string) => ({ $ref: `#/components/messages/${name}` });
const channelRef = (name: string) => ({ $ref: `#/channels/${name}` });
const channelMessageRef = (channel: string, message: string) => ({ $ref: `#/channels/${channel}/messages/${message}` });

const uuid = (description: string) => ({ type: 'string', format: 'uuid', description });

// ==================== DESCRIPTIONS ====================

const infoDescription = `
Socket.IO event contract of the Nodus backend. It covers **realtime delivery** of committed message changes only. The REST API stays the only way to create, edit and delete messages and to read message history ([OpenAPI document](https://${PRODUCTION_HOST}/api/openapi.json); interactive docs at \`/api/docs\` when the backend runs in development).

### How to read this document

Nodus uses Socket.IO, not a plain WebSocket API, and AsyncAPI has no Socket.IO binding. Therefore:

- every Socket.IO event is modelled as a channel whose \`address\` is the event name;
- \`receive\` and \`send\` are from the point of view of the **Nodus backend**: \`receive\` is a client-to-server event, \`send\` is a server-to-client event;
- Socket.IO specifics are described in text and with extensions: \`x-socketio-auth\` (handshake authentication), \`x-socketio-room\` (the room an event is bound to), \`x-socketio-rooms\` (room catalogue) and \`x-ack\` (acknowledgement callback);
- Socket.IO rooms are internal subscription groups, not AsyncAPI channels.

Use a Socket.IO client such as \`socket.io-client\`. A raw WebSocket client cannot speak the Socket.IO protocol.

### Authentication

Pass the JWT **access token** in the handshake \`auth\` payload. The backend reads \`socket.handshake.auth.token\`:

\`\`\`ts
const socket = io(BACKEND_URL, { auth: { token: accessToken } });
\`\`\`

The Authorization header, query string, cookies and refresh tokens are not used. A missing, invalid, expired or refresh token rejects the connection, and the client receives \`connect_error\` with the message \`Unauthorized\` or \`AccessTokenExpired\`. The token is verified only during the handshake, so reconnect with a current access token after it expires.

After authentication the server joins the socket to its private user room \`${USER_ROOM}\`. Clients cannot join or leave it.

### Client protocol

1. Connect with the access token.
2. Emit \`channel:join\` for the channel being opened.
3. Wait for a successful acknowledgement.
4. Fetch the message history through the REST API.
5. Merge realtime events with the REST history by \`message.id\`.

Joining before fetching the history means a message created in between is never lost. It may, however, appear **both** in the REST history and in a \`message:created\` event. That is expected: deduplicate by \`message.id\`.

### Reconnecting

Room membership is not persistent. After a reconnect the client must emit \`channel:join\` again for the open channel and reload the REST history to recover whatever it missed. The backend stores no socket subscriptions in PostgreSQL or Redis.

### Delivery semantics

Socket.IO is an ephemeral notification channel, not a message queue. Events are not stored or replayed, and a client that is offline or has not joined the channel never receives them. No exactly-once guarantee is provided. PostgreSQL, read through the REST API, is the source of truth.

### Rooms

| Room | Joined | Purpose |
| --- | --- | --- |
| \`${USER_ROOM}\` | automatically, after authentication | all sockets of one user (every tab and device) |
| \`${CHANNEL_ROOM}\` | by \`channel:join\` | delivery scope of the message events |
`.trim();

const joinChannelDescription = `
Subscribes the current socket to the realtime events of one channel. The authorization rules are the same as for reading the message history through the REST API:

1. The socket must be authenticated.
2. The user must be a member of the workspace, otherwise the acknowledgement is \`WorkspaceNotFound\`.
3. The channel must belong to that workspace, otherwise it is \`ChannelNotFound\`.

Only then is the socket added to the room \`${CHANNEL_ROOM}\`. Membership is verified once more after joining, so a member removed while the request is in flight is not left subscribed and also gets \`WorkspaceNotFound\`. Joining a room the socket is already in succeeds again.

Both ids are case-insensitive UUIDs. The server normalizes them to lowercase and echoes the normalized ids in the acknowledgement.

**Acknowledgement.** The callback passed as the last argument of \`emit\` is optional. If it is omitted the server still performs the operation but sends no response. See \`x-ack\` for the response schema.

Success:

\`\`\`json
{ "success": true, "data": { "workspaceId": "${EXAMPLE_IDS.workspace}", "channelId": "${EXAMPLE_IDS.channel}" }, "messageType": null, "errors": null }
\`\`\`

Failure:

\`\`\`json
{ "success": false, "data": null, "messageType": "WorkspaceNotFound", "errors": null }
\`\`\`

\`messageType\` is one of \`ValidationFailed\` (the payload does not match the schema), \`WorkspaceNotFound\`, \`ChannelNotFound\` or \`InternalError\` (unexpected failure).
`.trim();

const leaveChannelDescription = `
Removes the current socket from the room \`${CHANNEL_ROOM}\`, so it stops receiving the message events of that channel. Leaving only drops a local subscription: nothing is read from or written to the database and no authorization is needed. Leaving a room the socket is not in succeeds as well.

**Acknowledgement.** The callback is optional, like in \`channel:join\`. A successful response echoes the normalized ids. \`messageType\` is \`ValidationFailed\` when the payload does not match the schema, or \`InternalError\` for an unexpected failure.
`.trim();

const messageCreatedDescription = `
Sent after a message has been committed to PostgreSQL by \`POST /workspaces/{workspaceId}/channels/{channelId}/messages\` in the REST API. It is delivered to every socket in the room \`${CHANNEL_ROOM}\`, including the other tabs and devices of the author. Sockets that have not joined the channel do not receive it. If the database write fails, nothing is sent.

The \`message\` object is the same \`PublicMessage\` that the REST API returns. The event may arrive before or after the HTTP response, and the message may also be present in the REST history: deduplicate by \`message.id\`.
`.trim();

const messageUpdatedDescription = `
Sent after a message has been updated in PostgreSQL by \`PATCH /workspaces/{workspaceId}/channels/{channelId}/messages/{messageId}\` in the REST API. It is delivered to every socket in the room \`${CHANNEL_ROOM}\` and carries the current \`PublicMessage\`, with the new \`content\` and \`updatedAt\`. Who may edit a message is decided by the REST API. If the update is rejected or fails, nothing is sent.
`.trim();

const messageDeletedDescription = `
Sent after a message has been deleted from PostgreSQL by \`DELETE /workspaces/{workspaceId}/channels/{channelId}/messages/{messageId}\` in the REST API. It is delivered to every socket in the room \`${CHANNEL_ROOM}\`. The payload only identifies the removed message. Who may delete a message is decided by the REST API. If the deletion is rejected or fails, nothing is sent.
`.trim();

const workspaceAccessRevokedDescription = `
Sent after a member has been removed from a workspace by \`DELETE /workspaces/{workspaceId}/members/{userId}\` in the REST API, once the membership is deleted from PostgreSQL. This is currently its only trigger.

The event is targeted through the user room \`${USER_ROOM}\` of the removed user, so every socket of that user receives it. Before it is sent, those sockets are removed from all rooms \`${WORKSPACE_CHANNEL_ROOMS}\` of that workspace, so they receive no further message events from it.

The socket connection stays open. Rooms of other workspaces and the user's access to them are not affected. Clients should leave that workspace in the UI and refetch their navigation.
`.trim();

// ==================== ACKNOWLEDGEMENT ====================

const channelAck = (errors: readonly string[]) => ({
  optional: true,
  description: 'Socket.IO acknowledgement callback, passed as the last argument of emit.',
  payload: schemaRef('SocketAck'),
  errors,
});

// ==================== HANDSHAKE AUTHENTICATION ====================

const handshakeAuthentication = {
  location: 'socket.handshake.auth',
  field: 'token',
  tokenType: 'JWT access token',
  clientExample: 'io(BACKEND_URL, { auth: { token: accessToken } })',
  rejection: {
    event: 'connect_error',
    messages: ['Unauthorized', 'AccessTokenExpired'],
  },
};

// ==================== DOCUMENT ====================

export const asyncApiDocument = {
  asyncapi: '3.1.0',
  info: {
    title: 'Nodus Realtime API',
    version: '0.1.0',
    description: infoDescription,
    externalDocs: {
      description: 'REST API of the same backend (OpenAPI 3.0 document)',
      url: `https://${PRODUCTION_HOST}/api/openapi.json`,
    },
  },
  defaultContentType: 'application/json',
  servers: {
    production: {
      host: PRODUCTION_HOST,
      protocol: 'wss',
      pathname: SOCKET_IO_PATH,
      description: `Production backend. Connect a Socket.IO client to \`https://${PRODUCTION_HOST}\`; it uses the default Socket.IO path \`${SOCKET_IO_PATH}\` and upgrades to a secure WebSocket.`,
      'x-socketio-auth': handshakeAuthentication,
    },
    development: {
      host: 'localhost:{port}',
      protocol: 'ws',
      pathname: SOCKET_IO_PATH,
      description: `Local development backend. Connect a Socket.IO client to \`http://localhost:{port}\`; it uses the default Socket.IO path \`${SOCKET_IO_PATH}\`. Browser origins must be listed in \`CORS_ORIGINS\`.`,
      variables: {
        port: {
          default: '3000',
          description: 'Value of the PORT environment variable of the backend.',
        },
      },
      'x-socketio-auth': handshakeAuthentication,
    },
  },
  channels: {
    channelJoin: {
      address: received(SOCKET_EVENTS.CHANNEL_JOIN),
      title: 'Join a channel room',
      summary: 'The client asks to be subscribed to the realtime events of one channel.',
      messages: { ChannelJoin: messageRef('ChannelJoin') },
      'x-socketio-room': { name: CHANNEL_ROOM, effect: 'join' },
    },
    channelLeave: {
      address: received(SOCKET_EVENTS.CHANNEL_LEAVE),
      title: 'Leave a channel room',
      summary: 'The client unsubscribes from the realtime events of one channel.',
      messages: { ChannelLeave: messageRef('ChannelLeave') },
      'x-socketio-room': { name: CHANNEL_ROOM, effect: 'leave' },
    },
    messageCreated: {
      address: sent(SOCKET_EVENTS.MESSAGE_CREATED),
      title: 'A message was created',
      summary: 'A new message has been committed to the channel.',
      messages: { MessageCreated: messageRef('MessageCreated') },
      'x-socketio-room': { name: CHANNEL_ROOM, effect: 'emit' },
    },
    messageUpdated: {
      address: sent(SOCKET_EVENTS.MESSAGE_UPDATED),
      title: 'A message was updated',
      summary: 'A message of the channel has been edited.',
      messages: { MessageUpdated: messageRef('MessageUpdated') },
      'x-socketio-room': { name: CHANNEL_ROOM, effect: 'emit' },
    },
    messageDeleted: {
      address: sent(SOCKET_EVENTS.MESSAGE_DELETED),
      title: 'A message was deleted',
      summary: 'A message has been removed from the channel.',
      messages: { MessageDeleted: messageRef('MessageDeleted') },
      'x-socketio-room': { name: CHANNEL_ROOM, effect: 'emit' },
    },
    workspaceAccessRevoked: {
      address: sent(SOCKET_EVENTS.WORKSPACE_ACCESS_REVOKED),
      title: 'Workspace access was revoked',
      summary: 'The user has been removed from a workspace.',
      messages: { WorkspaceAccessRevoked: messageRef('WorkspaceAccessRevoked') },
      'x-socketio-room': { name: USER_ROOM, effect: 'emit' },
    },
  },
  operations: {
    joinChannel: {
      action: 'receive',
      channel: channelRef('channelJoin'),
      title: 'Join a channel room',
      summary: 'Receive a channel subscription request from the client.',
      description: joinChannelDescription,
      messages: [channelMessageRef('channelJoin', 'ChannelJoin')],
      'x-ack': channelAck(['ValidationFailed', 'WorkspaceNotFound', 'ChannelNotFound', 'InternalError']),
    },
    leaveChannel: {
      action: 'receive',
      channel: channelRef('channelLeave'),
      title: 'Leave a channel room',
      summary: 'Receive a channel unsubscription request from the client.',
      description: leaveChannelDescription,
      messages: [channelMessageRef('channelLeave', 'ChannelLeave')],
      'x-ack': channelAck(['ValidationFailed', 'InternalError']),
    },
    publishMessageCreated: {
      action: 'send',
      channel: channelRef('messageCreated'),
      title: 'Publish a created message',
      summary: 'Send message:created to the channel room.',
      description: messageCreatedDescription,
      messages: [channelMessageRef('messageCreated', 'MessageCreated')],
    },
    publishMessageUpdated: {
      action: 'send',
      channel: channelRef('messageUpdated'),
      title: 'Publish an updated message',
      summary: 'Send message:updated to the channel room.',
      description: messageUpdatedDescription,
      messages: [channelMessageRef('messageUpdated', 'MessageUpdated')],
    },
    publishMessageDeleted: {
      action: 'send',
      channel: channelRef('messageDeleted'),
      title: 'Publish a deleted message',
      summary: 'Send message:deleted to the channel room.',
      description: messageDeletedDescription,
      messages: [channelMessageRef('messageDeleted', 'MessageDeleted')],
    },
    publishWorkspaceAccessRevoked: {
      action: 'send',
      channel: channelRef('workspaceAccessRevoked'),
      title: 'Publish a workspace access revocation',
      summary: 'Send workspace:access-revoked to every socket of the removed user.',
      description: workspaceAccessRevokedDescription,
      messages: [channelMessageRef('workspaceAccessRevoked', 'WorkspaceAccessRevoked')],
    },
  },
  components: {
    messages: {
      ChannelJoin: {
        name: SOCKET_EVENTS.CHANNEL_JOIN,
        title: 'channel:join',
        summary: 'Subscribe the socket to a channel.',
        contentType: 'application/json',
        payload: schemaRef('ChannelSubscription'),
        examples: [{
          name: 'JoinChannel',
          payload: { workspaceId: EXAMPLE_IDS.workspace, channelId: EXAMPLE_IDS.channel },
        }],
      },
      ChannelLeave: {
        name: SOCKET_EVENTS.CHANNEL_LEAVE,
        title: 'channel:leave',
        summary: 'Unsubscribe the socket from a channel.',
        contentType: 'application/json',
        payload: schemaRef('ChannelSubscription'),
        examples: [{
          name: 'LeaveChannel',
          payload: { workspaceId: EXAMPLE_IDS.workspace, channelId: EXAMPLE_IDS.channel },
        }],
      },
      MessageCreated: {
        name: SOCKET_EVENTS.MESSAGE_CREATED,
        title: 'message:created',
        summary: 'A message was created in a channel the socket has joined.',
        contentType: 'application/json',
        payload: schemaRef('MessagePayload'),
        examples: [{
          name: 'MessageCreated',
          payload: {
            workspaceId: EXAMPLE_IDS.workspace,
            message: {
              id: EXAMPLE_IDS.message,
              channelId: EXAMPLE_IDS.channel,
              author: { id: EXAMPLE_IDS.user, firstName: 'John', lastName: 'Doe' },
              content: 'Hello everyone',
              createdAt: '2026-10-25T12:00:00.000Z',
              updatedAt: '2026-10-25T12:00:00.000Z',
            },
          },
        }],
      },
      MessageUpdated: {
        name: SOCKET_EVENTS.MESSAGE_UPDATED,
        title: 'message:updated',
        summary: 'A message was edited in a channel the socket has joined.',
        contentType: 'application/json',
        payload: schemaRef('MessagePayload'),
        examples: [{
          name: 'MessageUpdated',
          payload: {
            workspaceId: EXAMPLE_IDS.workspace,
            message: {
              id: EXAMPLE_IDS.message,
              channelId: EXAMPLE_IDS.channel,
              author: { id: EXAMPLE_IDS.user, firstName: 'John', lastName: 'Doe' },
              content: 'Hello everyone, edited',
              createdAt: '2026-10-25T12:00:00.000Z',
              updatedAt: '2026-10-25T12:05:00.000Z',
            },
          },
        }],
      },
      MessageDeleted: {
        name: SOCKET_EVENTS.MESSAGE_DELETED,
        title: 'message:deleted',
        summary: 'A message was deleted in a channel the socket has joined.',
        contentType: 'application/json',
        payload: schemaRef('MessageDeletedPayload'),
        examples: [{
          name: 'MessageDeleted',
          payload: {
            workspaceId: EXAMPLE_IDS.workspace,
            channelId: EXAMPLE_IDS.channel,
            messageId: EXAMPLE_IDS.message,
          },
        }],
      },
      WorkspaceAccessRevoked: {
        name: SOCKET_EVENTS.WORKSPACE_ACCESS_REVOKED,
        title: 'workspace:access-revoked',
        summary: 'The user was removed from a workspace.',
        contentType: 'application/json',
        payload: schemaRef('WorkspaceAccessRevokedPayload'),
        examples: [{
          name: 'AccessRevoked',
          payload: { workspaceId: EXAMPLE_IDS.workspace },
        }],
      },
    },
    schemas: {
      ChannelSubscription: {
        type: 'object',
        description: 'Identifies a channel. Ids are case-insensitive UUIDs and are normalized to lowercase by the server.',
        required: ['workspaceId', 'channelId'],
        additionalProperties: false,
        properties: {
          workspaceId: uuid('Workspace the channel belongs to.'),
          channelId: uuid('Channel to subscribe to or unsubscribe from.'),
        },
      },
      SocketAck: {
        description: 'Acknowledgement of channel:join and channel:leave. It has the same envelope as the REST API responses.',
        oneOf: [schemaRef('SocketAckSuccess'), schemaRef('SocketAckError')],
      },
      SocketAckSuccess: {
        type: 'object',
        required: ['success', 'data', 'messageType', 'errors'],
        additionalProperties: false,
        properties: {
          success: { const: true },
          data: schemaRef('ChannelSubscription'),
          messageType: { type: 'null' },
          errors: { type: 'null' },
        },
      },
      SocketAckError: {
        type: 'object',
        required: ['success', 'data', 'messageType', 'errors'],
        additionalProperties: false,
        properties: {
          success: { const: false },
          data: { type: 'null' },
          messageType: {
            type: 'string',
            enum: ['ValidationFailed', 'WorkspaceNotFound', 'ChannelNotFound', 'InternalError'],
            description: 'Machine-readable application error code.',
          },
          errors: { type: 'null' },
        },
      },
      MessageAuthor: {
        type: 'object',
        description: 'Public author information. Email, password hashes, sessions and tokens are never included.',
        required: ['id', 'firstName', 'lastName'],
        additionalProperties: false,
        properties: {
          id: uuid('Author user id.'),
          firstName: { type: 'string', examples: ['John'] },
          lastName: { type: 'string', examples: ['Doe'] },
        },
      },
      PublicMessage: {
        type: 'object',
        description: 'The public message shape returned by the REST API.',
        required: ['id', 'channelId', 'author', 'content', 'createdAt', 'updatedAt'],
        additionalProperties: false,
        properties: {
          id: uuid('Message id.'),
          channelId: uuid('Channel the message belongs to.'),
          author: schemaRef('MessageAuthor'),
          content: {
            type: 'string',
            minLength: 1,
            maxLength: 4000,
            description: 'Plain text.',
            examples: ['Hello everyone'],
          },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: {
            type: 'string',
            format: 'date-time',
            description: 'Timestamp of the most recent update. There is no separate edited flag or version history.',
          },
        },
      },
      MessagePayload: {
        type: 'object',
        description: 'Payload of message:created and message:updated.',
        required: ['workspaceId', 'message'],
        additionalProperties: false,
        properties: {
          workspaceId: uuid('Workspace the message belongs to.'),
          message: schemaRef('PublicMessage'),
        },
      },
      MessageDeletedPayload: {
        type: 'object',
        description: 'Payload of message:deleted. The message no longer exists in the database.',
        required: ['workspaceId', 'channelId', 'messageId'],
        additionalProperties: false,
        properties: {
          workspaceId: uuid('Workspace the message belonged to.'),
          channelId: uuid('Channel the message belonged to.'),
          messageId: uuid('Id of the deleted message.'),
        },
      },
      WorkspaceAccessRevokedPayload: {
        type: 'object',
        description: 'Payload of workspace:access-revoked.',
        required: ['workspaceId'],
        additionalProperties: false,
        properties: {
          workspaceId: uuid('Workspace the user was removed from.'),
        },
      },
    },
  },
  'x-socketio-rooms': {
    user: {
      name: USER_ROOM,
      description: 'Joined automatically after authentication. Contains every socket of one user. Not controlled by clients.',
    },
    channel: {
      name: CHANNEL_ROOM,
      description: 'Joined with channel:join after server-side authorization and left with channel:leave. Delivery scope of the message events.',
    },
  },
};
