import {
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  useCallback,
  useRef,
} from "react";
import { type RemoteStateClient } from "../client";
import { parsePath, type Path } from "../path";
import { RemoteStateContext } from "./context";
import type { Store } from "../types";
import type { TaskState, TaskStore } from "../tasks";

/**
 * Get the nearest Remote State client from React context.
 *
 * @typeParam S The type that defines the available service methods.
 * @returns The nearest typed Remote State client.
 * @throws If called outside `RemoteStateProvider`.
 */
export function useRemoteStateClient<S = unknown>(): RemoteStateClient<S> {
  const client = useContext(RemoteStateContext);
  if (!client) {
    throw new Error(
      "useRemoteStateClient must be used inside <RemoteStateProvider>",
    );
  }
  return client as RemoteStateClient<S>;
}

/**
 * Get the nearest reactive store from the current Remote State bridge.
 *
 * @returns The reactive store for the current client.
 */
export function useRemoteStore(): Store {
  const remoteState = useRemoteStateClient();
  return remoteState.store;
}

/**
 * Get the nearest task store from the current Remote State bridge.
 *
 * @returns The task store for the current client.
 */
export function useRemoteTaskStore(): TaskStore {
  const remoteState = useRemoteStateClient();
  return remoteState.tasks;
}

/**
 * Subscribe to one store path and return its current cached value.
 *
 * @typeParam T The expected value type at the path.
 * @param path The state path to read and subscribe to.
 * @returns The cached value, or `undefined` until it is available.
 */
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
export function useRemoteStateValue<T = unknown>(path: string): T | undefined {
  const pathSegments = useMemo(() => toPath(path), [path]);
  return useRemoteStateValueAt(pathSegments) as T | undefined;
}

function useRemoteStateValueAt(pathSegments: Path): unknown {
  const store = useRemoteStore();

  // Trigger fetch if not cached — runs after render, not during,
  // so getSnapshot remains pure and side effect free.
  useEffect(() => {
    store.provide(pathSegments);
  }, [store, pathSegments]);

  const subscribe = useCallback(
    (onStoreChange: () => void) => store.subscribe(pathSegments, onStoreChange),
    [store, pathSegments],
  );

  const getSnapshot = useCallback(
    () => store.get(pathSegments),
    [store, pathSegments],
  );

  return useSyncExternalStore(subscribe, getSnapshot);
}

/**
 * Functional-update shape accepted by `useRemoteState`.
 *
 * @typeParam T The state value type.
 */
export type SetStateValue<T> = T | ((prev: T | undefined) => T);

/**
 * Bind a store path to a React-friendly getter/setter pair.
 * Works similar to React's `useState` hook.
 *
 * @typeParam T The expected value type at the path.
 * @param path The state path to read, subscribe to, and write.
 * @returns A tuple containing the current value and an async setter.
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
  const store = useRemoteStore();
  const pathSegments = useMemo(() => toPath(path), [path]);
  const value = useRemoteStateValueAt(pathSegments) as T | undefined;
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
    void store.set(pathSegments, initialValue);
  }, [store, pathSegments, value, initialValue]);

  const setValue = useCallback(
    async (next: SetStateValue<T>) => {
      const nextValue =
        typeof next === "function"
          ? (next as (prev: T | undefined) => T)(valueRef.current)
          : next;
      await store.set(pathSegments, nextValue);
    },
    [store, pathSegments],
  );

  return [value, setValue];
}

function toPath(path: string): Path {
  const segments = parsePath(path);
  if (segments.length === 0) {
    throw new Error("RemoteState paths must be non-empty");
  }
  return segments as unknown as Path;
}

/**
 * Observe one tracked task by its user-supplied task-ID.
 *
 * @param taskId The task-ID passed as option to `remoteState.action()`
 *   or `remoteState.query()`.
 * @returns The current task snapshot, or `undefined` if not tracked.
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
 *
 * @returns All current task snapshots.
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
