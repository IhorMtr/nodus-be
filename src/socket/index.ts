import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';

import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { SOCKET_EVENTS } from './socket-events.js';
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

  io.on(SOCKET_EVENTS.CONNECTION, (socket) => {
    logger.debug({ socketId: socket.id }, 'Socket connected');

    socket.on(SOCKET_EVENTS.DISCONNECT, (reason) => {
      logger.debug({ socketId: socket.id, reason }, 'Socket disconnected');
    });
  });

  return io;
}
