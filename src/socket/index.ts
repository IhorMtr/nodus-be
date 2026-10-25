import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';

import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { SOCKET_EVENTS } from './socket-events.js';
import { authenticateSocket } from './socket.auth.js';
import { registerChannelHandlers } from './socket.channels.js';
import { bindSocketPublisher } from './socket.publisher.js';
import { userRoom } from './socket.rooms.js';
import type {
  ClientToServerEvents,
  InterServerEvents,
  ServerToClientEvents,
  SocketData,
  SocketServer,
} from './socket.types.js';

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

  bindSocketPublisher(io);
  io.use(authenticateSocket);

  io.on(SOCKET_EVENTS.CONNECTION, (socket) => {
    const { userId } = socket.data;
    logger.debug({ socketId: socket.id, userId }, 'Socket connected');

    // The default in-memory adapter joins synchronously, before any client event is handled.
    void socket.join(userRoom(userId));
    registerChannelHandlers(socket);

    socket.on(SOCKET_EVENTS.DISCONNECT, (reason) => {
      logger.debug({ socketId: socket.id, userId, reason }, 'Socket disconnected');
    });
  });

  return io;
}
