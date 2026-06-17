import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import {
  createLocalStateClient,
  RemoteStateProvider,
  useRemoteStateClient,
  type RemoteStateClient,
  type Store,
} from "../lib";

let websocketUrls: string[];

beforeEach(() => {
  websocketUrls = [];

  class MockWebSocket {
    onopen: (() => void) | null = null;
    onmessage: ((e: { data: string }) => void) | null = null;
    onclose: (() => void) | null = null;
    onerror: (() => void) | null = null;
    readyState = 0;
    send = vi.fn();
    close = vi.fn();

    constructor(url: string) {
      websocketUrls.push(url);
    }
  }

  vi.stubGlobal("WebSocket", MockWebSocket);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function createFallbackClient(): RemoteStateClient {
  const store: Store = {
    get: (pathSegments) =>
      pathSegments.length === 1 && pathSegments[0] === "source"
        ? "fallback"
        : undefined,
    set: vi.fn(),
    provide: vi.fn(),
    subscribe: vi.fn(() => vi.fn()),
    dispose: vi.fn(),
  };

  return createLocalStateClient({
    store,
  });
}

function RequiredClientStatus() {
  const client = useRemoteStateClient();
  const source = client.store.get(["source"]);
  return <span>{typeof source === "string" ? source : "remote"}</span>;
}

describe("RemoteStateProvider", () => {
  it("creates a remote client when URL is provided", () => {
    const html = renderToString(
      <RemoteStateProvider url="ws://localhost:9753/ws">
        <RequiredClientStatus />
      </RemoteStateProvider>,
    );

    expect(html).toContain("remote");
    expect(websocketUrls).toEqual(["ws://localhost:9753/ws"]);
  });

  it("uses fallback when URL is absent", () => {
    const fallback = vi.fn(createFallbackClient);

    const html = renderToString(
      <RemoteStateProvider fallback={fallback}>
        <RequiredClientStatus />
      </RemoteStateProvider>,
    );

    expect(html).toContain("fallback");
    expect(fallback).toHaveBeenCalledTimes(1);
    expect(websocketUrls).toEqual([]);
  });

  it("uses fallback when URL is blank", () => {
    const fallback = vi.fn(createFallbackClient);

    const html = renderToString(
      <RemoteStateProvider url="  " fallback={fallback}>
        <RequiredClientStatus />
      </RemoteStateProvider>,
    );

    expect(html).toContain("fallback");
    expect(fallback).toHaveBeenCalledTimes(1);
    expect(websocketUrls).toEqual([]);
  });

  it("throws when neither URL nor fallback is provided", () => {
    expect(() =>
      renderToString(
        <RemoteStateProvider>
          <RequiredClientStatus />
        </RemoteStateProvider>,
      ),
    ).toThrow("RemoteStateProvider requires either url or fallback");
  });

  it("keeps the hook strict without a provider", () => {
    expect(() => renderToString(<RequiredClientStatus />)).toThrow(
      "useRemoteStateClient must be used inside <RemoteStateProvider>",
    );
  });
});
