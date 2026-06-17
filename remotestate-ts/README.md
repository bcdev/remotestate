# RemoteState - TypeScript/React Library

[![CI](https://github.com/bcdev/remotestate/actions/workflows/ci.yml/badge.svg)](https://github.com/bcdev/remotestate/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/remotestate?logo=npm)](https://www.npmjs.com/package/remotestate)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white)](https://vite.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

`remotestate` is the browser-side bridge for RemoteState apps. It gives React a typed client, a provider, hooks, path helpers, and task tracking to talk to the Python backend.

If you want the high-level product overview, start with the repository root README:
[RemoteState](../README.md)

If you want the Python runtime details, see:
[remotestate-py/README.md](../remotestate-py/README.md)

## Install

```bash
npm install remotestate
```

## Development

- Node.js `>= 20`
- from the package directory: `cd remotestate-ts`
- install dependencies with `npm install`
- build with `npm run build`
- run tests with `npm run tests`
- run type-checks and linting with `npm run checks`
- format the workspace with `npm run format`

## Quick Start

```tsx
import {
  RemoteStateProvider,
  useRemoteState,
  useRemoteStateClient,
} from "remotestate";

type CounterService = {
  increment(): Promise<void>;
  compute(x: number): Promise<number>;
};

function Counter() {
  const client = useRemoteStateClient<CounterService>();
  const [count, setCount] = useRemoteState<number>("count", 0);

  return (
    <div>
      <p>Count: {count}</p>
      <button onClick={() => void setCount((n) => (n ?? 0) + 1)}>
        Local +1
      </button>
      <button onClick={() => void client.action("increment")}>
        Backend +1
      </button>
    </div>
  );
}

export function App() {
  return (
    <RemoteStateProvider url="ws://localhost:9753/ws">
      <Counter />
    </RemoteStateProvider>
  );
}
```

## API Overview

The public TypeScript API is exported from `remotestate`:

- `createRemoteStateClient`
- `createLocalRemoteStateClient`
- `RemoteStateProvider`
- `useRemoteStateClient`
- `useRemoteStore`
- `useRemoteTaskStore`
- `useRemoteStateValue`
- `useRemoteState`
- `useRemoteTask`
- `useRemoteTasks`
- `createRemoteTaskStore`
- `TaskStoreImpl`
- `parsePath`
- `formatPath`
- `getPathAt`
- `setPathAt`

## Remote Client

`createRemoteStateClient<S>(url, options?)` creates a typed client bound to one WebSocket endpoint.

- `url` can be a `ws://`/`wss://` endpoint or an `http://`/`https://` URL
- `http://` and `https://` URLs are normalized to the corresponding WebSocket endpoint
- the returned client exposes `store`, `tasks`, `action()`, `query()`, and `dispose()`
- `options.taskStore` lets you replace the default in-memory task store

```ts
import { createRemoteStateClient } from "remotestate";

type CounterService = {
  increment(): Promise<void>;
  compute(x: number): Promise<number>;
};

const client = createRemoteStateClient<CounterService>(
  "http://localhost:9753",
);
```

`client.action(method, args?, kwargs?, options?)` calls a Python `@action`.

- `taskId` enables progress tracking for the call
- `awaitInvalidate` waits for the resulting store update before resolving

`client.query(method, args?, kwargs?, options?)` calls a Python `@query` and returns the typed result.

## Provider and Hooks

`RemoteStateProvider` exposes one client to child components.

- `url` creates a remote client when it is present and non-blank
- `fallback` creates a local client when `url` is missing or blank
- `client` lets you inject an already-created client
- `taskStore` is passed through to `createRemoteStateClient` when the provider creates the client itself
- owned clients are disposed automatically when the provider unmounts

```tsx
import { RemoteStateProvider } from "remotestate";

export function App() {
  return <RemoteStateProvider url="ws://localhost:9753/ws">{/* ... */}</RemoteStateProvider>;
}
```

Hook overview:

- `useRemoteStateClient<S>()` returns the nearest typed client
- `useRemoteStore()` returns the reactive value store behind the hooks
- `useRemoteTaskStore()` returns the task store behind the progress hooks
- `useRemoteStateValue(path)` subscribes to one path and returns the cached value or `undefined`
- `useRemoteState(path, initialValue?)` behaves like React `useState` for one remote path
- `useRemoteTask(taskId)` returns one tracked task snapshot
- `useRemoteTasks()` returns all tracked task snapshots

```tsx
import {
  useRemoteState,
  useRemoteTask,
  useRemoteTasks,
} from "remotestate";

const [count, setCount] = useRemoteState<number>("count", 0);
const saveTask = useRemoteTask("save");
const allTasks = useRemoteTasks();
```

## Local Clients

`createLocalRemoteStateClient<S>(options)` wraps local application state in a RemoteState-compatible client.

- `store` is required
- `actions` and `queries` provide local implementations of the service contract
- `tasks` can replace the default in-memory task store
- `dispose` runs when the local client is released

This is the main building block for `RemoteStateProvider` fallback mode.

```tsx
import {
  RemoteStateProvider,
  createLocalRemoteStateClient,
  getPathAt,
  setPathAt,
  type Path,
  type RemoteStateClient,
  type Store,
} from "remotestate";

type CounterService = {
  increment(): Promise<void>;
  compute(x: number): Promise<number>;
};

function createCounterClient(): RemoteStateClient<CounterService> {
  let state = { count: 0 };
  const listeners = new Set<() => void>();

  const notify = () => {
    listeners.forEach((listener) => listener());
  };

  const store: Store = {
    get: (path: Path) => getPathAt(state, path),
    set: async (path: Path, value: unknown) => {
      const nextState = setPathAt(state, path, value) as typeof state;
      if (nextState !== state) {
        state = nextState;
        notify();
      }
    },
    provide: () => {},
    subscribe: (_path: Path, listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose: () => listeners.clear(),
  };

  return createLocalRemoteStateClient({
    store,
    actions: {
      increment: async () => {
        state = setPathAt(state, ["count"] as const, state.count + 1) as typeof state;
        notify();
      },
    },
    queries: {
      compute: async (x: number) => x * state.count,
    },
  });
}

export function App() {
  return <RemoteStateProvider fallback={createCounterClient}>{/* ... */}</RemoteStateProvider>;
}
```

## Path Helpers

The path helpers are useful when you need to work with nested state outside the React hooks.

- `parsePath(path)` turns a string path into parsed segments
- `formatPath(path)` turns parsed segments back into a string path
- `getPathAt(value, path)` reads a nested value
- `setPathAt(value, path, nextValue)` writes a nested value without mutating when nothing changes

```ts
import { getPathAt, parsePath, setPathAt } from "remotestate";

const path = parsePath("items[0].label");
const current = getPathAt(state, path);
const next = setPathAt(state, path, "updated");
```

## Task Stores

RemoteState tracks long-running actions and queries as task snapshots.

- `createRemoteTaskStore()` returns the default in-memory task store
- `TaskStoreImpl` is the concrete store implementation
- `useRemoteTaskStore()` and `useRemoteTasks()` let React components observe progress
- `useRemoteTask(taskId)` is useful when you know the task identifier up front

## More Docs

- [Repository root README](../README.md)
- [Python package README](../remotestate-py/README.md)
