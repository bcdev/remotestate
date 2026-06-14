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

    transport._triggerMessage({
      type: "get_result",
      call_id: "1",
      path: "count",
      value: 42,
    });

    expect(store.get("count")).toBe(42);
  });

  it("updates cache from ActionResultMessage patches", () => {
    const transport = mockTransportWithHandler();
    const store = new StoreImpl(asTransport(transport));

    transport._triggerMessage({
      type: "action_result",
      call_id: "abc",
      patches: [
        { op: "add", path: "/count", value: 99 },
        { op: "add", path: "/user", value: { name: "Norman" } },
      ],
    });

    expect(store.get("count")).toBe(99);
    expect(store.get("user")).toEqual({ name: "Norman" });
  });

  it("refreshes cached descendants from ActionResultMessage patches", () => {
    const transport = mockTransportWithHandler();
    const store = new StoreImpl(asTransport(transport));

    transport._triggerMessage({
      type: "get_result",
      call_id: "1",
      path: "user.name",
      value: "Norman",
    });

    transport._triggerMessage({
      type: "action_result",
      call_id: "abc",
      patches: [{ op: "add", path: "/user", value: { name: "Klaus" } }],
    });

    expect(store.get("user")).toEqual({ name: "Klaus" });
    expect(store.get("user.name")).toBe("Klaus");
  });

  it("refreshes cached indexed descendants from patches", () => {
    const transport = mockTransportWithHandler();
    const store = new StoreImpl(asTransport(transport));

    transport._triggerMessage({
      type: "get_result",
      call_id: "1",
      path: "items[0].label",
      value: "old",
    });

    transport._triggerMessage({
      type: "action_result",
      call_id: "abc",
      patches: [{ op: "add", path: "/items", value: [{ label: "new" }] }],
    });

    expect(store.get("items")).toEqual([{ label: "new" }]);
    expect(store.get("items[0].label")).toBe("new");
  });

  it("removes cached descendants missing from a patch value", () => {
    const transport = mockTransportWithHandler();
    const store = new StoreImpl(asTransport(transport));

    transport._triggerMessage({
      type: "get_result",
      call_id: "1",
      path: "user.name",
      value: "Norman",
    });

    transport._triggerMessage({
      type: "action_result",
      call_id: "abc",
      patches: [{ op: "add", path: "/user", value: { age: 42 } }],
    });

    expect(store.get("user")).toEqual({ age: 42 });
    expect(store.get("user.name")).toBeUndefined();
  });

  it("notifies listeners on value update", () => {
    const transport = mockTransportWithHandler();
    const store = new StoreImpl(asTransport(transport));
    const listener = vi.fn();
    store.subscribe(listener);

    transport._triggerMessage({
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

    transport._triggerMessage({
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

    store.provide("count");

    expect(transport.send).toHaveBeenCalledWith(
      expect.objectContaining({ type: "get", path: "count" }),
    );
  });

  it("does not fetch path if already cached", () => {
    const transport = mockTransportWithHandler();
    const store = new StoreImpl(asTransport(transport));

    transport._triggerMessage({
      type: "get_result",
      call_id: "1",
      path: "count",
      value: 42,
    });
    transport.send.mockClear();

    store.provide("count");

    expect(transport.send).not.toHaveBeenCalled();
  });

  it("does not fetch path if already pending", () => {
    const transport = mockTransport();
    const store = new StoreImpl(asTransport(transport));

    store.provide("count");
    store.provide("count");

    expect(transport.send).toHaveBeenCalledOnce();
  });

  it("clears pending after value arrives", () => {
    const transport = mockTransportWithHandler();
    const store = new StoreImpl(asTransport(transport));

    store.provide("count");
    transport._triggerMessage({
      type: "get_result",
      call_id: "1",
      path: "count",
      value: 1,
    });
    transport.send.mockClear();

    store.provide("count");

    expect(transport.send).not.toHaveBeenCalled();
  });
});
