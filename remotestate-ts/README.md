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
- `createLocalStateClient`
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
- `normalizePath`
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

const client = createRemoteStateClient<CounterService>("http://localhost:9753");
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
  return (
    <RemoteStateProvider url="ws://localhost:9753/ws">
      {/* ... */}
    </RemoteStateProvider>
  );
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
import { useRemoteState, useRemoteTask, useRemoteTasks } from "remotestate";

const [count, setCount] = useRemoteState<number>("count", 0);
const saveTask = useRemoteTask("save");
const allTasks = useRemoteTasks();
```

## Fallback Clients

`createLocalStateClient<S>(options)` wraps local application state in a RemoteState-compatible client.

- `store` is required
- `actions` and `queries` provide local implementations of the service contract
- `tasks` can replace the default in-memory task store
- `dispose` runs when the local client is released

This is the main building block for `RemoteStateProvider` fallback mode, i.e., if the WebSocket
URL was not provided to the `RemoteStateProvider`.

Find an example in the section **User Guide** below.

## Path Helpers

The path helpers are useful when you need to work with nested state outside
the React hooks.
They use a simplified [JSONPath](https://www.rfc-editor.org/info/rfc9535/)
form without the `$.` prefix. The empty string addresses the root state value.
Otherwise a path starts with an identifier, bracketed integer index, or
bracketed JSON string key, followed by dotted identifiers, bracketed integer
indices, or bracketed JSON string keys.
Bracketed string keys may use either single or double quotes; canonical output
always uses double quotes.

| Example                  | Valid? | Notes                                                 |
| ------------------------ | ------ | ----------------------------------------------------- |
| empty string             | yes    | root state value                                      |
| `user`                   | yes    | root property shorthand                               |
| `[0].label`              | yes    | array root plus child property                        |
| `items[0].label`         | yes    | dotted identifier plus integer index                  |
| `["display name"].value` | yes    | bracketed string key at the root                      |
| `user["display name"]`   | yes    | bracketed string key                                  |
| `$.user`                 | no     | `$.` prefix is not part of the syntax                 |
| `items[01]`              | no     | indices are canonical integers without leading zeroes |

- `normalizePath(path)` validates a path-like value and returns a `Path`
- `parsePath(path)` turns a strict string path into a `Path` and throws `SyntaxError` on malformed input
- `formatPath(path)` turns parsed segments back into canonical path syntax
- `getPathAt(value, path)` reads a nested value
- `setPathAt(value, path, nextValue)` writes a nested value without mutating when nothing changes

```ts
import { getPathAt, normalizePath, parsePath, setPathAt } from "remotestate";

const path = parsePath("items[0].label");
const labelPath = parsePath('user["display name"]');
const rootPath = parsePath("");
const arrayRootPath = normalizePath([0, "label"]);
const safePath = normalizePath(["items", 0, "label"]);
const current = getPathAt(state, path);
const next = setPathAt(state, path, "updated");
```

## Task Stores

RemoteState tracks long-running actions and queries as task snapshots.

- `createRemoteTaskStore()` returns the default in-memory task store
- `TaskStoreImpl` is the concrete store implementation
- `useRemoteTaskStore()` and `useRemoteTasks()` let React components observe progress
- `useRemoteTask(taskId)` is useful when you know the task identifier up front

## User Guide

### Direct Client

Use `createRemoteStateClient(url)` when you want a standalone bridge object.
The URL must be provided explicitly.

```tsx
import { createRemoteStateClient } from "remotestate";

type CounterService = {
  increment(): Promise<void>;
  compute(x: number): Promise<number>;
};

const client = createRemoteStateClient<CounterService>(
  "ws://localhost:9753/ws",
);
```

`client` exposes `action()` and `query()` methods together with the reactive
store and task store used by the React hooks.

The low-level store can be observed by path:

```typescript
const path = parsePath("items[1].label");
const unsubscribe = client.store.subscribe(path, () => {
  console.log(client.store.get(path));
});
```

Subscriptions also react to related parent or child updates. For example, a
listener on `"items"` fires when `"items[1].label"` changes.

### Using a Remote State

Use `RemoteStateProvider` when your app always expects a RemoteState backend.
The hooks below bind React components to the Python-owned `"count"` state and
the typed `increment` action.

```tsx
import {
  RemoteStateProvider,
  useRemoteStateClient,
  useRemoteState,
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
      <p>Count: {count ?? "..."}</p>
      <button onClick={() => void setCount((prev) => (prev ?? 0) + 1)}>
        Set from React
      </button>
      <button onClick={() => void client.action("increment")}>
        Run backend action
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

### Optional Remote State With Local State Fallback

Some applications can run with or without a RemoteState backend. For example,
an addon might use Python-owned state when a RemoteState URL is configured, but
fall back to the app's existing local state store when no backend is available.
The provider always exposes a client: it creates a remote client when `url` is a
non-empty string, otherwise it calls `fallback`. If neither `url` nor
`fallback` is provided, the provider throws.

Fallback clients use the same `RemoteStateClient` shape as remote clients, so
the standard hooks keep working and remain reactive. The example below adapts a
[Zustand](https://zustand.docs.pmnd.rs/) store for local fallback mode.

When you implement a fallback store, the store methods receive parsed path
segments. An empty path addresses the root state value. `getPathAt()` and `setPathAt()` are the shared path
helpers to use for nested reads and writes. `setPathAt()` preserves the
original identity when the target value is unchanged, which makes it easy to
skip unnecessary Zustand updates and avoid extra renders.

```tsx
import type { ReactNode } from "react";
import {
  RemoteStateProvider,
  createLocalStateClient,
  getPathAt,
  setPathAt,
  type LocalActionHandlers,
  type LocalQueryHandlers,
  type Path,
  type RemoteStateClient,
  type Store,
} from "remotestate";
import { useCounterStore } from "./counterStore";

type CounterService = {
  increment(): Promise<void>;
};

type CounterActions = LocalActionHandlers<CounterService>;
type CounterQueries = LocalQueryHandlers<CounterService>;

function createLocalCounterClient(): RemoteStateClient<CounterService> {
  const isCountProperty = (path: Path) =>
    path.length === 1 && path[0] === "count";

  const store: Store = {
    // Read the current local value for one RemoteState path.
    get: (path: Path): unknown => {
      if (isCountProperty(path)) {
        return getPathAt(useCounterStore.getState(), path);
      }
    },

    // Write one RemoteState path; useRemoteState() setters call this method.
    set: (path: Path, value: unknown): void => {
      if (isCountProperty(path)) {
        const currentState = useCounterStore.getState();
        const nextState = setPathAt(currentState, path, value);
        if (nextState !== currentState) {
          useCounterStore.setState(nextState);
        }
      }
    },

    // Re-render hook consumers when the subscribed path changes.
    subscribe: (path: Path, listener: () => void): (() => void) => {
      if (isCountProperty(path)) {
        return useCounterStore.subscribe(listener);
      }
      return () => {};
    },

    // Ensure a path is available; local tasks are already available here.
    provide: (_path: Path): void => {},

    // Release local resources owned by this store, if any.
    dispose: (): void => {},
  };

  const actions: CounterActions = {
    // Implement local equivalents for client.action("increment").
    increment: (): void => {
      useCounterStore.getState().increment();
    },
  };

  const queries: CounterQueries = {
    // Add local equivalents for client.query(...) methods. Not used here.
  };

  return createLocalStateClient<CounterService>({
    // Reactive store used by useRemoteStateValue() and useRemoteState().
    store,

    // Local service actions used by useRemoteStateClient().action(...).
    actions,

    // Local service queries used by useRemoteStateClient().query(...).
    queries,
  });
}

export function CounterStateProvider({
  remoteUrl,
  children,
}: {
  remoteUrl?: string | null;
  children: ReactNode;
}) {
  return (
    <RemoteStateProvider url={remoteUrl} fallback={createLocalCounterClient}>
      {children}
    </RemoteStateProvider>
  );
}
```

Components can now use `useRemoteState()`, `useRemoteStateValue()`, and
`useRemoteStateClient()` in both modes. When `url` changes between absent and
present, the provider switches clients and disposes the client it created. It
does not sync state between the fallback client and the remote client.

## More Docs

- [Repository root README](../README.md)
- [Python package README](../remotestate-py/README.md)
