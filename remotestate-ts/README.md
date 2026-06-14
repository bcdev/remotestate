# RemoteState - TypeScript/React

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
  set_state(path: string, value: unknown): Promise<void>;
  increment(): Promise<void>;
};

function Counter() {
  const client = useRemoteStateClient<CounterService>();
  const [count, setCount] = useRemoteState<number>("count", 0);

  return (
    <div>
      <p>Count: {count}</p>
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
an addon might use Python-owned state when a RemoteState client is configured,
but fall back to the app's existing local state store when no backend is
available. The example below uses [Zustand](https://zustand.docs.pmnd.rs/),
but the same pattern works with other state management libraries.

In that shape, avoid passing a nullable `RemoteStateClient` into every action.
Instead, define a small app-owned state API and provide one implementation for
RemoteState and one implementation for local state. Components and actions
depend on that non-null API, while the provider decides which implementation to
use.

```tsx
import { createContext, useContext, useMemo, type ReactNode } from "react";
import {
  RemoteStateProvider,
  useOptionalRemoteStateClient,
  type RemoteStateClient,
} from "remotestate";
import { useCounterStore } from "./counterStore";

type CounterService = {
  set_state(path: string, value: unknown): Promise<void>;
  increment(): Promise<void>;
};

type CounterActions = {
  setCount(next: number): Promise<void>;
  increment(): Promise<void>;
};

function createRemoteCounterActions(
  client: RemoteStateClient<CounterService>,
): CounterActions {
  return {
    setCount: (next) =>
      client.action(
        "set_state",
        ["count", next],
        {},
        { awaitInvalidate: true },
      ),
    increment: () => client.action("increment"),
  };
}

function createLocalCounterActions(): CounterActions {
  return {
    setCount: async (next) => {
      useCounterStore.getState().setCount(next);
    },
    increment: async () => {
      useCounterStore.getState().increment();
    },
  };
}

const CounterActionsContext = createContext<CounterActions | null>(null);

export function CounterStateProvider({
  remoteUrl,
  children,
}: {
  remoteUrl?: string | null;
  children: ReactNode;
}) {
  return (
    <RemoteStateProvider active={Boolean(remoteUrl)} url={remoteUrl}>
      <CounterActionsProvider>{children}</CounterActionsProvider>
    </RemoteStateProvider>
  );
}

function CounterActionsProvider({ children }: { children: ReactNode }) {
  const client = useOptionalRemoteStateClient<CounterService>();
  const actions = useMemo(
    () =>
      client ? createRemoteCounterActions(client) : createLocalCounterActions(),
    [client],
  );

  return (
    <CounterActionsContext.Provider value={actions}>
      {children}
    </CounterActionsContext.Provider>
  );
}

export function useCounterActions(): CounterActions {
  const actions = useContext(CounterActionsContext);
  if (!actions) {
    throw new Error(
      "useCounterActions must be used inside CounterStateProvider",
    );
  }
  return actions;
}
```

The same pattern works for larger stores: keep the shared TypeScript state type
in your app, expose the smallest set of reads and mutations your UI needs, and
hide whether those operations are backed by RemoteState or local state. Reads can
use the same idea: expose an app-owned hook or selector that chooses
`useRemoteState()` or a local selector behind the provider boundary.

---

For full project documentation, see the repository root README:
[Remote State](https://github.com/bcdev/remotestate)
