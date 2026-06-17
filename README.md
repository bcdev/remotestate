# RemoteState

[![CI](https://github.com/bcdev/remotestate/actions/workflows/ci.yml/badge.svg)](https://github.com/bcdev/remotestate/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![PyPI version](https://img.shields.io/pypi/v/remotestate?logo=pypi)](https://pypi.org/project/remotestate/)
[![npm version](https://img.shields.io/npm/v/remotestate?logo=npm)](https://www.npmjs.com/package/remotestate)

> Python state, React UI.

RemoteState is a Python-first framework for building stateful React frontends. Python owns the state and behavior, while React owns the presentation. Use it when you want a single source of truth in Python and a typed TypeScript bridge in the browser.

It fits especially well for:

- notebook apps where Python drives the workflow
- frontend addons or plugins that need an optional Python backend
- teams that want one runtime for state, actions, queries, and progress updates

If you want a pure client-side React state library with no Python backend, RemoteState is probably not the right fit.

## What You Get

- Python-owned `Store` state with path-based reads and writes
- `@action` and `@query` methods for mutating and read-only calls
- WebSocket synchronization between Python and React
- typed TypeScript client, provider, and hooks
- task and progress updates from long-running work
- notebook and browser serving from the Python runtime
- optional local fallback clients for addon-style apps

## How It Works

- Python is the source of truth for business state and behavior
- TypeScript/React renders the UI and calls into Python when needed
- the WebSocket bridge carries reads, writes, queries, actions, and task updates

## Simple Example

```python
import remotestate as rs


class Counter(rs.Service):
    def __init__(self) -> None:
        super().__init__(rs.Store({"count": 0}))

    @rs.action
    async def increment(self) -> None:
        self.store.set("count", self.store.get("count") + 1)


service = Counter()
rs.serve(service, ui_dist="ui/dist")
```

```tsx
import {
  RemoteStateProvider,
  useRemoteState,
  useRemoteStateClient,
} from "remotestate";

type CounterService = {
  increment(): Promise<void>;
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

export default function App() {
  return (
    <RemoteStateProvider url="ws://localhost:9753/ws">
      <Counter />
    </RemoteStateProvider>
  );
}
```

## Package Docs

- [Python package README](./remotestate-py/README.md)
- [TypeScript package README](./remotestate-ts/README.md)

## License

MIT © [@forman](https://github.com/forman)
