# RemoteState - TypeScript/React Library

[![CI](https://github.com/bcdev/remotestate/actions/workflows/ci.yml/badge.svg)](https://github.com/bcdev/remotestate/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/remotestate?logo=npm)](https://www.npmjs.com/package/remotestate)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white)](https://vite.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

`remotestate` is the TypeScript and React bridge of the _RemoteState_ library.

This package provides the frontend client, provider, and hooks that pair with
the Python backend from the main repository.

## Install

```bash
npm install remotestate
```

## Direct Client

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
const unsubscribe = client.store.subscribe("items[1].label", () => {
  console.log(client.store.get("items[1].label"));
});
```

Subscriptions also react to related parent or child updates. For example, a
listener on `"items"` fires when `"items[1].label"` changes.

## Using a Remote State

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

## Optional Remote State With Local State Fallback

Some applications can run with or without a RemoteState backend. For example,
an addon might use Python-owned state when a RemoteState URL is configured, but
fall back to the app's existing local state store when no backend is available.
The provider always exposes a client: it creates a remote client when `url` is a
non-empty string, otherwise it calls `fallback`. If neither `url` nor
`fallback` is provided, the provider throws.

Fallback clients use the same `RemoteStateClient` shape as remote clients, so
the standard hooks keep working and remain reactive. The example below adapts a
[Zustand](https://zustand.docs.pmnd.rs/) store for local fallback mode.

The `set(path, value)` action shown below mirrors RemoteState's built-in
Python service action used by `useRemoteState()` setters. It is not required by
`RemoteStateClient` itself, but a local fallback should provide this action when
it needs to support `useRemoteState()` writes. Declaring it on the service type
lets TypeScript check that the local handler uses the expected signature.

```tsx
import type { ReactNode } from "react";
import {
  createLocalRemoteStateClient,
  RemoteStateProvider,
  type RemoteStateClient,
  type Store,
} from "remotestate";
import { useCounterStore } from "./counterStore";

type CounterService = {
  set(path: string, value: unknown): Promise<void>;
  increment(): Promise<void>;
};

function createLocalCounterClient(): RemoteStateClient<CounterService> {
  const store: Store = {
    get: (path) =>
      path === "count" ? useCounterStore.getState().count : undefined,
    provide: () => {},
    subscribe: (path, listener) => {
      if (path !== "count") {
        return () => {};
      }
      return useCounterStore.subscribe(listener);
    },
    dispose: () => {},
  };

  return createLocalRemoteStateClient<CounterService>({
    store,
    actions: {
      set: (path, value) => {
        if (path === "count" && typeof value === "number") {
          useCounterStore.getState().setCount(value);
        }
      },
      increment: () => {
        useCounterStore.getState().increment();
      },
    },
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

---

For full project documentation, see the repository root README:
[Remote State](https://github.com/bcdev/remotestate)
