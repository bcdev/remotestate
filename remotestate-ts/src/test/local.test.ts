import { describe, expect, it, vi } from "vitest";
import { createLocalRemoteStateClient, type Store } from "../lib";

describe("createLocalRemoteStateClient", () => {
  function createStore(): Store {
    return {
      get: vi.fn(),
      set: vi.fn(),
      provide: vi.fn(),
      subscribe: vi.fn(() => vi.fn()),
      dispose: vi.fn(),
    };
  }

  it("dispatches local actions and queries", async () => {
    type CounterService = {
      increment(step: number): Promise<void>;
      count(): Promise<number>;
    };
    let count = 0;
    const client = createLocalRemoteStateClient<CounterService>({
      store: createStore(),
      actions: {
        increment: (step) => {
          count += step;
        },
      },
      queries: {
        count: () => count,
      },
    });

    await client.action("increment", [2]);

    await expect(client.query("count")).resolves.toBe(2);
  });

  it("delegates the built-in set action to the store", async () => {
    const set = vi.fn();
    const client = createLocalRemoteStateClient({
      store: {
        ...createStore(),
        set,
      },
    });

    await client.action("set", ["count", 7]);

    expect(set).toHaveBeenCalledWith(["count"], 7);
  });

  it("rejects built-in set action without a string path", async () => {
    const client = createLocalRemoteStateClient({
      store: createStore(),
    });

    await expect(client.action("set", [7, "count"])).rejects.toThrow(
      "Local set action requires a string path",
    );
  });

  it("throws for unsupported local methods", async () => {
    const client = createLocalRemoteStateClient({
      store: createStore(),
    });

    await expect(client.action("missing")).rejects.toThrow(
      "Unsupported local action: missing",
    );
    await expect(client.query("missing")).rejects.toThrow(
      "Unsupported local query: missing",
    );
  });

  it("disposes local resources", () => {
    const storeDispose = vi.fn();
    const store: Store = {
      get: vi.fn(),
      set: vi.fn(),
      provide: vi.fn(),
      subscribe: vi.fn(() => vi.fn()),
      dispose: storeDispose,
    };
    const dispose = vi.fn();
    const client = createLocalRemoteStateClient({ store, dispose });

    client.dispose();

    expect(dispose).toHaveBeenCalledTimes(1);
    expect(storeDispose).toHaveBeenCalledTimes(1);
  });
});
