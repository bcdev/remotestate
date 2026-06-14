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

  it("updates cache from ActionResultMessage", () => {
    const transport = mockTransportWithHandler();
    const store = new StoreImpl(asTransport(transport));

    transport._triggerMessage({
      type: "action_result",
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
    store.subscribe("count", listener);

    transport._triggerMessage({
      type: "get_result",
      call_id: "1",
      path: "count",
      value: 1,
    });

    expect(listener).toHaveBeenCalledOnce();
  });

  it("notifies listeners subscribed to an action update path", () => {
    const transport = mockTransportWithHandler();
    const store = new StoreImpl(asTransport(transport));
    const listener = vi.fn();
    store.subscribe("items[1].label", listener);

    transport._triggerMessage({
      type: "action_result",
      call_id: "abc",
      updates: { "items[1].label": "Test 2" },
    });

    expect(listener).toHaveBeenCalledOnce();
  });

  it("notifies once when multiple action updates overlap a subscribed path", () => {
    const transport = mockTransportWithHandler();
    const store = new StoreImpl(asTransport(transport));
    const listener = vi.fn();
    store.subscribe("items", listener);

    transport._triggerMessage({
      type: "action_result",
      call_id: "abc",
      updates: {
        "items[1].label": "Test 2",
        "items[0].label": "Test 1",
      },
    });

    expect(listener).toHaveBeenCalledOnce();
  });

  it("does not notify listeners subscribed to sibling paths", () => {
    const transport = mockTransportWithHandler();
    const store = new StoreImpl(asTransport(transport));
    const listener = vi.fn();
    store.subscribe("items[1].label", listener);

    transport._triggerMessage({
      type: "action_result",
      call_id: "abc",
      updates: { "items[0].label": "Test 1" },
    });

    expect(listener).not.toHaveBeenCalled();
  });

  it("notifies child listeners when a parent path updates", () => {
    const transport = mockTransportWithHandler();
    const store = new StoreImpl(asTransport(transport));
    const listener = vi.fn();
    store.subscribe("items[1].label", listener);

    transport._triggerMessage({
      type: "action_result",
      call_id: "abc",
      updates: { "items[1]": { id: 1, label: "Test 2" } },
    });

    expect(listener).toHaveBeenCalledOnce();
  });

  it("notifies parent path listeners when a child path changes", () => {
    const transport = mockTransportWithHandler();
    const store = new StoreImpl(asTransport(transport));
    const listener = vi.fn();
    store.subscribe("x.y", listener);

    transport._triggerMessage({
      type: "action_result",
      call_id: "abc",
      updates: { "x.y.z": "changed" },
    });

    expect(listener).toHaveBeenCalledOnce();
  });

  it("does not treat partial segment matches as parent paths", () => {
    const transport = mockTransportWithHandler();
    const store = new StoreImpl(asTransport(transport));
    const listener = vi.fn();
    store.subscribe("x.y", listener);

    transport._triggerMessage({
      type: "action_result",
      call_id: "abc",
      updates: { "x.yz": "changed" },
    });

    expect(listener).not.toHaveBeenCalled();
  });

  it("patches cached parent values from a leaf action update", () => {
    const transport = mockTransportWithHandler();
    const store = new StoreImpl(asTransport(transport));
    const items = [
      { id: 0, label: "foo" },
      { id: 1, label: "bar" },
    ];

    transport._triggerMessage({
      type: "get_result",
      call_id: "1",
      path: "items",
      value: items,
    });

    transport._triggerMessage({
      type: "action_result",
      call_id: "abc",
      updates: { "items[1].label": "Test 2" },
    });

    expect(store.get("items")).toEqual([
      { id: 0, label: "foo" },
      { id: 1, label: "Test 2" },
    ]);
    expect(store.get("items")).not.toBe(items);
  });

  it("refreshes cached child values from a parent action update", () => {
    const transport = mockTransportWithHandler();
    const store = new StoreImpl(asTransport(transport));

    transport._triggerMessage({
      type: "get_result",
      call_id: "1",
      path: "items[1].label",
      value: "bar",
    });

    transport._triggerMessage({
      type: "action_result",
      call_id: "abc",
      updates: { "items[1]": { id: 1, label: "Test 2" } },
    });

    expect(store.get("items[1].label")).toBe("Test 2");
  });

  it("unsubscribe stops listener notifications", () => {
    const transport = mockTransportWithHandler();
    const store = new StoreImpl(asTransport(transport));
    const listener = vi.fn();
    const unsubscribe = store.subscribe("count", listener);
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
