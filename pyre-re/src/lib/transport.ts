import type { IncomingMessage, OutgoingMessage } from "./protocol";
import type { IPyreTransport } from "./types";

type MessageHandler = (msg: OutgoingMessage) => void;

const RECONNECT_DELAY_MS = 1000;
const MAX_RECONNECT_DELAY_MS = 30_000;

export class PyreTransport implements IPyreTransport {
  private ws: WebSocket | null = null;
  private handlers: Set<MessageHandler> = new Set();
  private pendingRequests: IncomingMessage[] = [];
  private reconnectDelay = RECONNECT_DELAY_MS;
  private closed = false;

  constructor(private readonly url: string) {
    this.connect();
  }

  private connect(): void {
    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      if (!this.ws) {
        return;
      }
      this.reconnectDelay = RECONNECT_DELAY_MS;
      // flush pending requests
      for (const msg of this.pendingRequests) {
        this.ws.send(JSON.stringify(msg));
      }
      this.pendingRequests = [];
    };

    this.ws.onmessage = (event) => {
      if (typeof event.data === "string") {
        const msg = JSON.parse(event.data) as OutgoingMessage;
        for (const handler of this.handlers) {
          handler(msg);
        }
      }
    };

    this.ws.onclose = () => {
      if (this.closed) {
        return;
      }
      setTimeout(() => {
        this.connect();
      }, this.reconnectDelay);
      this.reconnectDelay = Math.min(
        this.reconnectDelay * 2,
        MAX_RECONNECT_DELAY_MS,
      );
    };

    this.ws.onerror = () => {
      // onclose fires automatically after onerror — reconnect runs there.
      this.ws?.close();
    };
  }

  send(msg: IncomingMessage): void {
    // Use literal 1 instead of WebSocket.OPEN — the constant may not be
    // available in all environments (e.g. jsdom in tests).
    if (this.ws?.readyState === 1) {
      this.ws.send(JSON.stringify(msg));
    } else {
      this.pendingRequests.push(msg);
    }
  }

  subscribe(handler: MessageHandler): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  close(): void {
    this.closed = true;
    this.ws?.close();
  }
}
