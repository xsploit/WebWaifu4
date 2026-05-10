import type { Server as HttpServer } from 'node:http';
import { WebSocket, WebSocketServer, type RawData } from 'ws';
import type { StreamBotEvent } from '../scheduler/ChatScheduler.js';

export type OverlayClientEvent =
  | { type: 'overlay:ready'; payload?: Record<string, unknown> }
  | { type: 'tts:done'; payload?: Record<string, unknown> }
  | { type: 'avatar:loaded'; payload?: Record<string, unknown> }
  | { type: 'manual:prompt'; payload?: { text?: string } };

function parseClientEvent(data: RawData): OverlayClientEvent | null {
  try {
    const parsed = JSON.parse(data.toString()) as Partial<OverlayClientEvent>;
    return typeof parsed.type === 'string' ? (parsed as OverlayClientEvent) : null;
  } catch {
    return null;
  }
}

export class OverlaySocket {
  private readonly server: WebSocketServer;
  private readonly clients = new Set<WebSocket>();

  constructor(
    httpServer: HttpServer,
    private readonly onClientEvent?: (event: OverlayClientEvent) => void,
  ) {
    this.server = new WebSocketServer({ server: httpServer, path: '/ws' });
    this.server.on('connection', (socket) => {
      this.clients.add(socket);
      this.broadcast({
        type: 'system:status',
        payload: { level: 'info', message: 'Overlay socket connected.' },
      });

      socket.on('message', (data) => {
        const event = parseClientEvent(data);
        if (event) {
          this.onClientEvent?.(event);
        }
      });

      socket.on('close', () => {
        this.clients.delete(socket);
      });
    });
  }

  get clientCount() {
    return this.clients.size;
  }

  broadcast(event: StreamBotEvent) {
    const payload = JSON.stringify(event);
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  }

  close() {
    this.server.close();
    for (const client of this.clients) {
      client.close();
    }
    this.clients.clear();
  }
}
