import {
  useContext,
  useEffect,
  useSyncExternalStore,
  useCallback,
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
  return client;
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
