import type { IncomingMessage, OutgoingMessage } from "./protocol";
import type { Transport } from "./types";
import { DebugLog, getDebugLog } from "./debug";

type MessageHandler = (msg: OutgoingMessage) => void;

const RECONNECT_DELAY_MS = 1000;
const MAX_RECONNECT_DELAY_MS = 30_000;

/**
 * WebSocket transport with reconnect and send-queue handling.
 */
export class TransportImpl implements Transport {
  private ws: WebSocket | null = null;
  private handlers: Set<MessageHandler> = new Set();
  private pendingRequests: IncomingMessage[] = [];
  private reconnectDelay = RECONNECT_DELAY_MS;
  private closed = false;
  private readonly debugLog: DebugLog;

  /**
   * Create a WebSocket transport.
   *
   * @param url WebSocket endpoint URL.
   * @param debug If true, outputs debugging info to the console.
   */
  constructor(
    private readonly url: string,
    debug?: boolean,
  ) {
    this.debugLog = getDebugLog(!!debug);
    this.connect();
  }

  private connect(): void {
    this.debugLog(`Connecting to ${this.url}...`);
    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      if (!this.ws) {
        return;
      }
      this.debugLog(`Connection to ${this.url} opened.`);
      this.reconnectDelay = RECONNECT_DELAY_MS;
      // flush pending requests
      for (const msg of this.pendingRequests) {
        this.ws.send(stringifyMessage(msg));
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
      this.debugLog(`Connection to ${this.url} unintentionally closed.`);
      this.debugLog(`Reconnecting in ${this.reconnectDelay.toString()} ms.`);
      setTimeout(() => {
        this.connect();
      }, this.reconnectDelay);
      this.reconnectDelay = Math.min(
        this.reconnectDelay * 2,
        MAX_RECONNECT_DELAY_MS,
      );
    };

    this.ws.onerror = () => {
      if (this.ws) {
        this.debugLog(`Connection to ${this.url} failed.`);
        // onclose fires automatically after onerror — reconnect runs there.
        this.ws.close();
      }
    };
  }

  /**
   * Send a message to Python, queueing it until the socket is open if needed.
   *
   * @param msg The protocol message to send.
   */
  send(msg: IncomingMessage): void {
    // Use literal 1 instead of WebSocket.OPEN — the constant may not be
    // available in all environments (e.g. jsdom in tests).
    if (this.ws?.readyState === 1) {
      this.ws.send(stringifyMessage(msg));
    } else {
      this.pendingRequests.push(msg);
    }
  }

  /**
   * Register a callback for messages received from Python.
   *
   * @param handler The callback invoked for each outgoing protocol message.
   * @returns A function that unregisters the callback.
   */
  subscribe(handler: MessageHandler): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  /**
   * Close the socket and disable reconnect attempts.
   */
  close(): void {
    this.debugLog(`Closing connection to ${this.url}.`);
    this.closed = true;
    this.ws?.close();
  }
}

function stringifyMessage(msg: IncomingMessage): string {
  return JSON.stringify(msg, normalizeJsonValue);
}

function normalizeJsonValue(_key: string, value: unknown): unknown {
  return value === undefined ? null : value;
}
