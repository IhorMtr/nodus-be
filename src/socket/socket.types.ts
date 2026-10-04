import type { Server } from 'socket.io';

export type ClientToServerEvents = Record<never, never>;
export type ServerToClientEvents = Record<never, never>;
export type InterServerEvents = Record<never, never>;
export type SocketData = Record<string, never>;

export type SocketServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;
