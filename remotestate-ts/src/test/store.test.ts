import { describe, it, expect, vi } from "vitest";
import { StoreImpl } from "../lib/store";
import { mockTransport, mockTransportWithHandler, asTransport } from "./mocks";

describe("StoreImpl", () => {
  it("returns undefined for uncached path", () => {
    const store = new StoreImpl(asTransport(mockTransport()));
    expect(store.get(["count"])).toBeUndefined();
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

    expect(store.get(["count"])).toBe(42);
  });

  it("caches the root value from GetResultMessage", () => {
    const transport = mockTransportWithHandler();
    const store = new StoreImpl(asTransport(transport));
    const value = [{ label: "foo" }];

    transport._triggerMessage({
      type: "get_result",
      call_id: "1",
      path: "",
      value,
    });

    expect(store.get([])).toBe(value);
    expect(store.get()).toBe(value);
  });

  it("updates cache from ActionResultMessage", () => {
    const transport = mockTransportWithHandler();
    const store = new StoreImpl(asTransport(transport));

    transport._triggerMessage({
      type: "action_result",
      call_id: "abc",
      updates: { count: 99, "user.name": "Norman" },
    });

    expect(store.get(["count"])).toBe(99);
    expect(store.get(["user", "name"])).toBe("Norman");
  });

  it("notifies listeners on value update", () => {
    const transport = mockTransportWithHandler();
    const store = new StoreImpl(asTransport(transport));
    const listener = vi.fn();
    store.subscribe(["count"], listener);

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
    store.subscribe(["items", 1, "label"], listener);

    transport._triggerMessage({
      type: "action_result",
      call_id: "abc",
      updates: { "items[1].label": "Test 2" },
    });

    expect(listener).toHaveBeenCalledOnce();
  });

  it("notifies root listeners on child updates", () => {
    const transport = mockTransportWithHandler();
    const store = new StoreImpl(asTransport(transport));
    const listener = vi.fn();
    store.subscribe([], listener);

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
    store.subscribe(["items"], listener);

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
    store.subscribe(["items", 1, "label"], listener);

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
    store.subscribe(["items", 1, "label"], listener);

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
    store.subscribe(["x", "y"], listener);

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
    store.subscribe(["x", "y"], listener);

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

    expect(store.get(["items"])).toEqual([
      { id: 0, label: "foo" },
      { id: 1, label: "Test 2" },
    ]);
    expect(store.get(["items"])).not.toBe(items);
  });

  it("patches cached root values from a leaf action update", () => {
    const transport = mockTransportWithHandler();
    const store = new StoreImpl(asTransport(transport));
    const root = { items: [{ label: "foo" }] };

    transport._triggerMessage({
      type: "get_result",
      call_id: "1",
      path: "",
      value: root,
    });

    transport._triggerMessage({
      type: "action_result",
      call_id: "abc",
      updates: { "items[0].label": "x" },
    });

    expect(store.get([])).toEqual({ items: [{ label: "x" }] });
    expect(store.get([])).not.toBe(root);
  });

  it("materializes a subscribed parent snapshot from a leaf action update", () => {
    const transport = mockTransportWithHandler();
    const store = new StoreImpl(asTransport(transport));
    const listener = vi.fn();
    store.subscribe(["processRequests"], listener);

    transport._triggerMessage({
      type: "action_result",
      call_id: "abc",
      updates: { "processRequests.sleep_a_while.inputs.duration": 123 },
    });

    expect(listener).toHaveBeenCalledOnce();
    expect(store.get(["processRequests"])).toEqual({
      sleep_a_while: { inputs: { duration: 123 } },
    });
  });

  it("still fetches a parent path after materializing it from a leaf update", () => {
    const transport = mockTransportWithHandler();
    const store = new StoreImpl(asTransport(transport));
    store.subscribe(["processRequests"], vi.fn());

    transport._triggerMessage({
      type: "action_result",
      call_id: "abc",
      updates: { "processRequests.sleep_a_while.inputs.duration": 123 },
    });
    transport.send.mockClear();

    store.provide(["processRequests"]);

    expect(transport.send).toHaveBeenCalledWith(
      expect.objectContaining({ type: "get", path: "processRequests" }),
    );
  });

  it("materializes a subscribed child snapshot from a parent action update", () => {
    const transport = mockTransportWithHandler();
    const store = new StoreImpl(asTransport(transport));
    const listener = vi.fn();
    store.subscribe(["processRequests", "sleep_a_while", "inputs"], listener);

    transport._triggerMessage({
      type: "action_result",
      call_id: "abc",
      updates: {
        processRequests: {
          sleep_a_while: { inputs: { duration: 123 }, outputs: {} },
        },
      },
    });

    expect(listener).toHaveBeenCalledOnce();
    expect(
      store.get(["processRequests", "sleep_a_while", "inputs"]),
    ).toEqual({ duration: 123 });
  });

  it("materializes a subscribed child snapshot from a root action update", () => {
    const transport = mockTransportWithHandler();
    const store = new StoreImpl(asTransport(transport));
    const listener = vi.fn();
    store.subscribe(["items", 0, "label"], listener);

    transport._triggerMessage({
      type: "action_result",
      call_id: "abc",
      updates: { "": { items: [{ label: "x" }] } },
    });

    expect(listener).toHaveBeenCalledOnce();
    expect(store.get(["items", 0, "label"])).toBe("x");
  });

  it("materializes a subscribed child snapshot from a parent fetch result", () => {
    const transport = mockTransportWithHandler();
    const store = new StoreImpl(asTransport(transport));
    const listener = vi.fn();
    store.subscribe(["processRequests", "sleep_a_while", "inputs"], listener);

    transport._triggerMessage({
      type: "get_result",
      call_id: "1",
      path: "processRequests",
      value: {
        sleep_a_while: { inputs: { duration: 123 }, outputs: {} },
      },
    });

    expect(listener).toHaveBeenCalledOnce();
    expect(
      store.get(["processRequests", "sleep_a_while", "inputs"]),
    ).toEqual({ duration: 123 });
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

    expect(store.get(["items", 1, "label"])).toBe("Test 2");
  });

  it("unsubscribe stops listener notifications", () => {
    const transport = mockTransportWithHandler();
    const store = new StoreImpl(asTransport(transport));
    const listener = vi.fn();
    const unsubscribe = store.subscribe(["count"], listener);
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

    store.provide(["count"]);

    expect(transport.send).toHaveBeenCalledWith(
      expect.objectContaining({ type: "get", path: "count" }),
    );
  });

  it("fetches the root path if not cached", () => {
    const transport = mockTransport();
    const store = new StoreImpl(asTransport(transport));

    store.provide([]);

    expect(transport.send).toHaveBeenCalledWith(
      expect.objectContaining({ type: "get", path: "" }),
    );
  });

  it("sets a path through the built-in set action", () => {
    const transport = mockTransportWithHandler();
    const store = new StoreImpl(asTransport(transport));

    void store.set(["count"], 3);

    expect(transport.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "action",
        method: "set",
        args: ["count", 3],
        kwargs: {},
      }),
    );
  });

  it("sets the root path through the built-in set action", () => {
    const transport = mockTransportWithHandler();
    const store = new StoreImpl(asTransport(transport));

    void store.set([], { count: 3 });

    expect(transport.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "action",
        method: "set",
        args: ["", { count: 3 }],
        kwargs: {},
      }),
    );
  });

  it("resolves set after matching action result", async () => {
    const transport = mockTransportWithHandler();
    const store = new StoreImpl(asTransport(transport));

    const promise = store.set(["count"], 3);
    const sentMsg = transport.send.mock.calls[0][0] as { call_id: string };

    transport._triggerMessage({
      type: "action_result",
      call_id: sentMsg.call_id,
      updates: { count: 3 },
    });

    await expect(promise).resolves.toBeUndefined();
    expect(store.get(["count"])).toBe(3);
  });

  it("rejects set on matching error", async () => {
    const transport = mockTransportWithHandler();
    const store = new StoreImpl(asTransport(transport));

    const promise = store.set(["count"], 3);
    const sentMsg = transport.send.mock.calls[0][0] as { call_id: string };

    transport._triggerMessage({
      type: "error",
      call_id: sentMsg.call_id,
      message: "oops",
    });

    await expect(promise).rejects.toThrow("oops");
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

    store.provide(["count"]);

    expect(transport.send).not.toHaveBeenCalled();
  });

  it("does not fetch path if already pending", () => {
    const transport = mockTransport();
    const store = new StoreImpl(asTransport(transport));

    store.provide(["count"]);
    store.provide(["count"]);

    expect(transport.send).toHaveBeenCalledOnce();
  });

  it("clears pending after value arrives", () => {
    const transport = mockTransportWithHandler();
    const store = new StoreImpl(asTransport(transport));

    store.provide(["count"]);
    transport._triggerMessage({
      type: "get_result",
      call_id: "1",
      path: "count",
      value: 1,
    });
    transport.send.mockClear();

    store.provide(["count"]);

    expect(transport.send).not.toHaveBeenCalled();
  });
});
