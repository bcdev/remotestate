import { vi } from "vitest";
import type { Transport } from "../lib/types";

export interface MockTransport {
  send: ReturnType<typeof vi.fn>;
  subscribe: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
}

export interface MockTransportWithTrigger extends MockTransport {
  _triggerMessage: (msg: unknown) => void;
}

export function asTransport(mock: MockTransport): Transport {
  return mock as unknown as Transport;
}

export function mockTransport(): MockTransport {
  return {
    subscribe: vi.fn(() => vi.fn()),
    send: vi.fn(),
    close: vi.fn(),
  };
}

export function mockTransportWithHandler(): MockTransportWithTrigger {
  const handlers: Set<(msg: unknown) => void> = new Set();
  return {
    subscribe: vi.fn((h: (msg: unknown) => void) => {
      handlers.add(h);
      return vi.fn(() => {
        handlers.delete(h);
      });
    }),
    send: vi.fn(),
    close: vi.fn(),
    _triggerMessage: (msg) => {
      for (const handler of handlers) {
        handler(msg);
      }
    },
  };
}
