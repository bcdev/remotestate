import { describe, expect, it, vi } from "vitest";
import { createLocalRemoteStateClient, type Store } from "../lib";

describe("createLocalRemoteStateClient", () => {
  function createStore(): Store {
    return {
      get: vi.fn(),
      provide: vi.fn(),
      subscribe: vi.fn(() => vi.fn()),
      dispose: vi.fn(),
    };
  }

  it("dispatches local actions and queries", async () => {
    type CounterService = {
      get(path: string): Promise<number>;
      set(path: string, value: number): Promise<void>;
      increment(step: number): Promise<void>;
      count(): Promise<number>;
    };
    let count = 0;
    const client = createLocalRemoteStateClient<CounterService>({
      store: createStore(),
      actions: {
        set: (path, value) => {
          if (path === "count") {
            count = value;
          }
        },
        increment: (step) => {
          count += step;
        },
      },
      queries: {
        get: (path) => (path === "count" ? count : 0),
        count: () => count,
      },
    });

    await client.action("increment", [2]);

    await expect(client.query("count")).resolves.toBe(2);
    await expect(client.query("get", ["count"])).resolves.toBe(2);

    await client.action("set", ["count", 7]);

    await expect(client.query("count")).resolves.toBe(7);
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
