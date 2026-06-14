import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import {
  RemoteStateProvider,
  useOptionalRemoteStateClient,
  useRemoteStateClient,
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
  vi.stubGlobal("location", {
    search: "",
    protocol: "http:",
    host: "localhost:5173",
    pathname: "/",
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function OptionalClientStatus() {
  const client = useOptionalRemoteStateClient();
  return <span>{client ? "remote" : "local"}</span>;
}

function RequiredClientStatus() {
  useRemoteStateClient();
  return <span>remote</span>;
}

describe("RemoteStateProvider", () => {
  it("does not create a client when inactive", () => {
    const html = renderToString(
      <RemoteStateProvider active={false}>
        <OptionalClientStatus />
      </RemoteStateProvider>,
    );

    expect(html).toContain("local");
    expect(websocketUrls).toEqual([]);
  });

  it("returns null from the optional hook for an explicit null client", () => {
    const html = renderToString(
      <RemoteStateProvider client={null}>
        <OptionalClientStatus />
      </RemoteStateProvider>,
    );

    expect(html).toContain("local");
    expect(websocketUrls).toEqual([]);
  });

  it("creates a client by default", () => {
    const html = renderToString(
      <RemoteStateProvider>
        <OptionalClientStatus />
      </RemoteStateProvider>,
    );

    expect(html).toContain("remote");
    expect(websocketUrls).toEqual(["ws://localhost:5173/ws"]);
  });

  it("keeps the required hook strict when the provider is inactive", () => {
    expect(() =>
      renderToString(
        <RemoteStateProvider active={false}>
          <RequiredClientStatus />
        </RemoteStateProvider>,
      ),
    ).toThrow("useRemoteStateClient must be used inside an active");
  });
});
