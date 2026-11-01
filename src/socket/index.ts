import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';

import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { presenceService } from '../modules/presence/presence.service.js';
import { SOCKET_EVENTS } from './socket-events.js';
import { authenticateSocket } from './socket.auth.js';
import { registerChannelHandlers } from './socket.channels.js';
import { socketPublisher } from './socket.publisher.js';
import { userRoom } from './socket.rooms.js';
import type {
  ClientToServerEvents,
  InterServerEvents,
  ServerToClientEvents,
  SocketData,
  SocketServer,
} from './socket.types.js';

// ==================== SOCKET LIFECYCLE ====================

export function initializeSocket(httpServer: HttpServer): SocketServer {
  const io = new Server<
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData
  >(httpServer, {
    cors: {
      origin: env.CORS_ORIGINS,
    },
  });

  socketPublisher.bind(io);
  io.use(authenticateSocket);

  io.on(SOCKET_EVENTS.CONNECTION, socket => {
    const { userId } = socket.data;
    logger.info({ socketId: socket.id, userId }, 'Socket connected');

    // The default in-memory adapter joins synchronously, before any client event is handled.
    void socket.join(userRoom(userId));
    registerChannelHandlers(socket);
    const connected = presenceService.connect(userId, socket.id);

    socket.on(SOCKET_EVENTS.DISCONNECT, reason => {
      logger.debug(
        { socketId: socket.id, userId, reason },
        'Socket disconnected'
      );
      void connected.then(() => presenceService.disconnect(socket.id));
    });
  });

  return io;
}
