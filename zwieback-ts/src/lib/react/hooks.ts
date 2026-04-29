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
import type { TaskState, TaskStore } from "../tasks";

/**
 * Get the nearest zwieback client from React context.
 */
export function useClient<TService>(): Client<TService> {
  const client = useContext(ClientContext);
  if (!client) {
    throw new Error("useClient must be used inside <ClientProvider>");
  }
  return client as Client<TService>;
}

/**
 * Get the nearest reactive store from the current client.
 */
export function useStore(): Store {
  const client = useClient();
  return client.store;
}

/**
 * Get the nearest task store from the current client.
 */
export function useTaskStore(): TaskStore {
  const client = useClient();
  return client.tasks;
}

/**
 * Subscribe to one store path and return its current cached value.
 */
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
export function useStateValue<T = unknown>(path: string): T | undefined {
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
    () => store.get(path) as T | undefined,
    [store, path],
  );

  return useSyncExternalStore(subscribe, getSnapshot);
}

/**
 * Functional-update shape accepted by `useState`.
 */
export type SetStateValue<T> = T | ((prev: T | undefined) => T);

/**
 * Bind a store path to a React-friendly getter/setter pair.
 */
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

/**
 * Observe one tracked task by its user-supplied task ID.
 */
export function useTask(tid: string): TaskState | undefined {
  const taskStore = useTaskStore();

  const subscribe = useCallback(
    (onStoreChange: () => void) => taskStore.subscribe(onStoreChange),
    [taskStore],
  );

  const getSnapshot = useCallback(
    () => taskStore.getTask(tid),
    [taskStore, tid],
  );

  return useSyncExternalStore(subscribe, getSnapshot);
}

/**
 * Observe all tracked tasks. The list is not sorted.
 */
export function useTasks(): readonly TaskState[] {
  const taskStore = useTaskStore();

  const subscribe = useCallback(
    (onStoreChange: () => void) => taskStore.subscribe(onStoreChange),
    [taskStore],
  );

  const getSnapshot = useCallback(
    () => taskStore.getAllTasks(),
    [taskStore],
  );

  return useSyncExternalStore(subscribe, getSnapshot);
}
