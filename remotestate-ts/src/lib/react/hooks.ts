import {
  useContext,
  useEffect,
  useSyncExternalStore,
  useCallback,
  useRef,
} from "react";
import { type RemoteState } from "../client";
import { RemoteStateContext } from "./context";
import { Store } from "../types";
import type { TaskState, TaskStore } from "../tasks";

/**
 * Get the nearest Remote State bridge from React context.
 */
export function useRemoteStateClient<TService>(): RemoteState<TService> {
  const remoteState = useContext(RemoteStateContext);
  if (!remoteState) {
    throw new Error(
      "useRemoteStateClient must be used inside <RemoteStateProvider>",
    );
  }
  return remoteState as RemoteState<TService>;
}

/**
 * Get the nearest reactive store from the current Remote State bridge.
 */
export function useRemoteStore(): Store {
  const remoteState = useRemoteStateClient();
  return remoteState.store;
}

/**
 * Get the nearest task store from the current Remote State bridge.
 */
export function useRemoteTaskStore(): TaskStore {
  const remoteState = useRemoteStateClient();
  return remoteState.tasks;
}

/**
 * Subscribe to one store path and return its current cached value.
 */
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
export function useRemoteStateValue<T = unknown>(path: string): T | undefined {
  const store = useRemoteStore();

  // Trigger fetch if not cached — runs after render, not during,
  // so getSnapshot remains pure and side effect free.
  useEffect(() => {
    store.provide(path);
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
 * Functional-update shape accepted by `useRemoteState`.
 */
export type SetStateValue<T> = T | ((prev: T | undefined) => T);

/**
 * Bind a store path to a React-friendly getter/setter pair.
 * Works similar to React's `useState` hook.
 */
export function useRemoteState<T = unknown>(
  path: string,
): [T | undefined, (next: SetStateValue<T>) => Promise<void>];
export function useRemoteState<T = unknown>(
  path: string,
  initialValue: T,
): [T, (next: SetStateValue<T>) => Promise<void>];
export function useRemoteState<T = unknown>(
  path: string,
  initialValue?: T,
): [T | undefined, (next: SetStateValue<T>) => Promise<void>] {
  const remoteState = useRemoteStateClient();
  const value = useRemoteStateValue<T>(path);
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
    void remoteState.action(
      "set_state",
      [path, initialValue],
      {},
      { awaitInvalidate: true },
    );
  }, [remoteState, path, value, initialValue]);

  const setValue = useCallback(
    async (next: SetStateValue<T>) => {
      const nextValue =
        typeof next === "function"
          ? (next as (prev: T | undefined) => T)(valueRef.current)
          : next;
      await remoteState.action(
        "set_state",
        [path, nextValue],
        {},
        { awaitInvalidate: true },
      );
    },
    [remoteState, path],
  );

  return [value, setValue];
}

/**
 * Observe one tracked task by its user-supplied task-ID.
 *
 * @param taskId The task-ID passed as option to `remoteState.action()`
 *   or `remoteState.query()`.
 */
export function useRemoteTask(taskId: string): TaskState | undefined {
  const taskStore = useRemoteTaskStore();

  const subscribe = useCallback(
    (onStoreChange: () => void) => taskStore.subscribe(onStoreChange),
    [taskStore],
  );

  const getSnapshot = useCallback(
    () => taskStore.getTask(taskId),
    [taskStore, taskId],
  );

  return useSyncExternalStore(subscribe, getSnapshot);
}

/**
 * Observe all tracked tasks. The list is not sorted.
 */
export function useRemoteTasks(): readonly TaskState[] {
  const taskStore = useRemoteTaskStore();

  const subscribe = useCallback(
    (onStoreChange: () => void) => taskStore.subscribe(onStoreChange),
    [taskStore],
  );

  const getSnapshot = useCallback(() => taskStore.getAllTasks(), [taskStore]);

  return useSyncExternalStore(subscribe, getSnapshot);
}
