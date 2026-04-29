import { describe, it, expect, vi } from "vitest";
import { StoreImpl } from "../lib/store";
import { mockTransport, mockTransportWithHandler, asTransport } from "./mocks";

describe("StoreImpl", () => {
  it("returns undefined for uncached path", () => {
    const store = new StoreImpl(asTransport(mockTransport()));
    expect(store.get("count")).toBeUndefined();
  });

  it("caches value from GetResultMessage", () => {
    const transport = mockTransportWithHandler();
    const store = new StoreImpl(asTransport(transport));

    transport._trigger({
      type: "get_result",
      call_id: "1",
      path: "count",
      value: 42,
    });

    expect(store.get("count")).toBe(42);
  });

  it("updates cache from InvalidateMessage", () => {
    const transport = mockTransportWithHandler();
    const store = new StoreImpl(asTransport(transport));

    transport._trigger({
      type: "invalidate",
      call_id: "abc",
      updates: { count: 99, "user.name": "Norman" },
    });

    expect(store.get("count")).toBe(99);
    expect(store.get("user.name")).toBe("Norman");
  });

  it("notifies listeners on value update", () => {
    const transport = mockTransportWithHandler();
    const store = new StoreImpl(asTransport(transport));
    const listener = vi.fn();
    store.subscribe(listener);

    transport._trigger({
      type: "get_result",
      call_id: "1",
      path: "count",
      value: 1,
    });

    expect(listener).toHaveBeenCalledOnce();
  });

  it("unsubscribe stops listener notifications", () => {
    const transport = mockTransportWithHandler();
    const store = new StoreImpl(asTransport(transport));
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    unsubscribe();

    transport._trigger({
      type: "get_result",
      call_id: "1",
      path: "count",
      value: 1,
    });

    expect(listener).not.toHaveBeenCalled();
  });

  it("fetches path if not cached", () => {
    const transport = mockTransport();
    const store = new StoreImpl(asTransport(transport));

    store._fetchIfNeeded("count");

    expect(transport.send).toHaveBeenCalledWith(
      expect.objectContaining({ type: "get", path: "count" }),
    );
  });

  it("does not fetch path if already cached", () => {
    const transport = mockTransportWithHandler();
    const store = new StoreImpl(asTransport(transport));

    transport._trigger({
      type: "get_result",
      call_id: "1",
      path: "count",
      value: 42,
    });
    transport.send.mockClear();

    store._fetchIfNeeded("count");

    expect(transport.send).not.toHaveBeenCalled();
  });

  it("does not fetch path if already pending", () => {
    const transport = mockTransport();
    const store = new StoreImpl(asTransport(transport));

    store._fetchIfNeeded("count");
    store._fetchIfNeeded("count");

    expect(transport.send).toHaveBeenCalledOnce();
  });

  it("clears pending after value arrives", () => {
    const transport = mockTransportWithHandler();
    const store = new StoreImpl(asTransport(transport));

    store._fetchIfNeeded("count");
    transport._trigger({
      type: "get_result",
      call_id: "1",
      path: "count",
      value: 1,
    });
    transport.send.mockClear();

    store._fetchIfNeeded("count");

    expect(transport.send).not.toHaveBeenCalled();
  });
});
