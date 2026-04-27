import { vi } from "vitest";
import type { IPyreTransport, IPyreStore } from "../lib/types";

export interface MockTransport {
  send: ReturnType<typeof vi.fn>;
  subscribe: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
}

export interface MockTransportWithTrigger extends MockTransport {
  _trigger: (msg: unknown) => void;
}

export interface MockStore {
  getSnapshot: ReturnType<typeof vi.fn>;
  subscribe: ReturnType<typeof vi.fn>;
  _fetchIfNeeded: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
}

export function asTransport(mock: MockTransport): IPyreTransport {
  return mock as unknown as IPyreTransport;
}

export function asStore(mock: MockStore): IPyreStore {
  return mock as unknown as IPyreStore;
}

export function mockTransport(): MockTransport {
  return {
    subscribe: vi.fn(() => vi.fn()),
    send: vi.fn(),
    close: vi.fn(),
  };
}

export function mockTransportWithHandler(): MockTransportWithTrigger {
  let handler: (msg: unknown) => void = () => {};
  return {
    subscribe: vi.fn((h: (msg: unknown) => void) => {
      handler = h;
      return vi.fn();
    }),
    send: vi.fn(),
    close: vi.fn(),
    _trigger: (msg) => {
      handler(msg);
    },
  };
}

export function mockStore(): MockStore {
  return {
    getSnapshot: vi.fn(() => undefined),
    subscribe: vi.fn(() => vi.fn()),
    _fetchIfNeeded: vi.fn(),
    dispose: vi.fn(),
  };
}
