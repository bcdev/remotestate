import {
  useContext,
  useEffect,
  useSyncExternalStore,
  useCallback,
  useRef,
} from "react";
import { Client } from "../client";
import { ClientContext } from "./context";
import { Store } from "../types";

export function useClient<TService>(): Client<TService> {
  /**
   * Gets the nearest zwieback client.
   * Throws an error if it cannot be found.
   */
  const client = useContext(ClientContext);
  if (!client) {
    throw new Error("useClient must be used inside <ClientProvider>");
  }
  return client as Client<TService>;
}

export function useStore(): Store {
  /**
   * Gets the nearest zwieback store.
   */
  const client = useClient();
  return client.store;
}

// eslint-disable-next-line
export function useStateValue<T = unknown>(path: string): T | undefined {
  /**
   * Gets a value from the state at the given `path`.
   */
  const store = useStore();

  // Trigger fetch if not cached — runs after render, not during,
  // so getSnapshot remains pure and side effect free.
  useEffect(() => {
    store._fetchIfNeeded(path);
  }, [store, path]);

  const subscribe = useCallback(
    (onStoreChange: () => void) => store.subscribe(onStoreChange),
    [store],
  );

  const getSnapshot = useCallback(
    () => store.getSnapshot(path) as T | undefined,
    [store, path],
  );

  return useSyncExternalStore(subscribe, getSnapshot);
}

export type SetStateValue<T> = T | ((prev: T | undefined) => T);

export function useState<T = unknown>(
  path: string,
): [T | undefined, (next: SetStateValue<T>) => Promise<void>];
export function useState<T = unknown>(
  path: string,
  initialValue: T,
): [T, (next: SetStateValue<T>) => Promise<void>];
export function useState<T = unknown>(
  path: string,
  initialValue?: T,
): [T | undefined, (next: SetStateValue<T>) => Promise<void>] {
  const client = useClient();
  const value = useStateValue<T>(path);
  const hasInitialized = useRef(false);
  const valueRef = useRef<T | undefined>(value);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  useEffect(() => {
    if (
      hasInitialized.current ||
      value !== undefined ||
      initialValue === undefined
    ) {
      return;
    }
    hasInitialized.current = true;
    void client.action(
      "set_state",
      [path, initialValue],
      {},
      { awaitInvalidate: true },
    );
  }, [client, path, value, initialValue]);

  const setValue = useCallback(
    async (next: SetStateValue<T>) => {
      const nextValue =
        typeof next === "function"
          ? (next as (prev: T | undefined) => T)(valueRef.current)
          : next;
      await client.action(
        "set_state",
        [path, nextValue],
        {},
        { awaitInvalidate: true },
      );
    },
    [client, path],
  );

  return [value, setValue];
}
