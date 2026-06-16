# RemoteState

[![CI](https://github.com/bcdev/remotestate/actions/workflows/ci.yml/badge.svg)](https://github.com/bcdev/remotestate/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

[![PyPI version](https://img.shields.io/pypi/v/remotestate?logo=pypi)](https://pypi.org/project/remotestate/)
[![Python](https://img.shields.io/badge/Python-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![pydantic](https://img.shields.io/badge/pydantic-E92063?logo=pydantic&logoColor=white)](https://docs.pydantic.dev/)
[![Ruff](https://img.shields.io/badge/Ruff-2C2F3A?logo=ruff&logoColor=white)](https://docs.astral.sh/ruff/)

[![npm version](https://img.shields.io/npm/v/remotestate?logo=npm)](https://www.npmjs.com/package/remotestate)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white)](https://vite.dev/)


> **Python state, React UI.** One runtime for notebook apps and addon backends.

_RemoteState_ is a Python-first framework for building stateful React frontends.
It lets you define application state, actions, and queries in Python, then
render the UI in React/TypeScript over a WebSocket bridge.

Package-specific docs:
- [Python package README](./remotestate-py/README.md)
- [TypeScript package README](./remotestate-ts/README.md)

The library is designed around two primary use cases:

1. **React frontends for Python code** - especially notebook-driven UIs, where a Jupyter cell or Python script owns the state and the browser only renders the interface.
2. **Addon and plugin backends for frontend apps** - where a frontend addon can ship a TS/React UI and, optionally, a Python backend that provides server-side state, actions, and queries.

In both cases, Python is the source of truth for business state and behavior.
React handles presentation, interaction, and reactivity on the browser side.

---

## What RemoteState Provides

- **Python-owned application state** - store nested state in a `Store` and mutate it through actions.
- **Read and write separation** - use `@action` for mutations and `@query` for read-only calls.
- **Reactive bridge caching** - the frontend fetches values lazily and re-renders when state changes.
- **Progress updates** - long-running actions and queries can emit progress events to the UI.
- **Notebook rendering** - show the UI inline in Jupyter or open it in a browser.
- **Addon-friendly architecture** - bundle a React UI and an optional Python backend behind one API surface.
- **Typed TypeScript bridge** - consume the backend from React with `createRemoteStateClient`, `RemoteStateProvider`,
  `useRemoteStateClient`, and hooks.

---

## How It Fits Together

Remote State splits responsibilities cleanly:

- **Python** owns state, domain logic, actions, queries, and progress reporting.
- **TypeScript/React** owns rendering, local interaction, and typed bridge access.
- **WebSocket transport** connects both sides and carries state reads, path updates, and task updates.

That makes the package useful both as a notebook UI runtime and as a backend layer for a frontend addon system.

---

## Quick Start

### Python backend

```python
import remotestate as rs

store = rs.Store(
    {
        "count": 0,
        "user": {"name": "forman"},
    }
)


class MyService(rs.Service):
    @rs.action
    async def increment(self):
        self.store.set("count", self.store.get("count") + 1)

    @rs.query
    async def compute(self, x: float) -> float:
        self.update_task(name="Computing...", progress=50)
        return x * self.store.get("count")


rs.serve(MyService(store), ui_dist="my-ui/dist")
```

### React frontend

```typescript
// MyService.ts - typed contract for the Python service
export interface MyService {
  increment(): Promise<void>;
  compute(x: number): Promise<number>;
}
```

```tsx
import {
  RemoteStateProvider,
  useRemoteStateClient,
  useRemoteState,
} from "remotestate";
import type { MyService } from "./MyService";

function AppInner() {
  const client = useRemoteStateClient<MyService>();
  const [count, setCount] = useRemoteState<number>("count", 0);
  const [name] = useRemoteState<string>("user.name");

  return (
    <div>
      <p>Hello, {name ?? "..."}! Count: {count ?? "..."}</p>
      <button onClick={() => void setCount((n) => (n ?? 0) + 1)}>+1</button>
      <button
        onClick={async () => {
          const result = await client.query("compute", [5.0]);
          console.log(result);
        }}
      >
        Compute
      </button>
    </div>
  );
}

export default function App() {
  return (
    <RemoteStateProvider url="ws://localhost:9753/ws">
      <AppInner />
    </RemoteStateProvider>
  );
}
```

---

## Typical Project Shapes

### 1. Notebook app

```text
my-notebook-project/
  app.ipynb
  service.py
  ui/
    src/
      App.tsx
      MyService.ts
    dist/
```

Use this shape when the notebook or a Python script is the main entry point and the browser is just the renderer.

### 2. Frontend addon or plugin

```text
my-addon/
  frontend/
    src/
      App.tsx
      addon.ts
  backend/
    service.py
  dist/
```

Use this shape when a frontend app exposes an addon API and the addon optionally ships a Python backend for stateful behavior.

---

## Installation

### Python

```bash
pip install remotestate
```

Or with [pixi](https://pixi.sh):

```bash
pixi add remotestate
```

### TypeScript / React

```bash
npm install remotestate
```

---

## Python API

### `Store(initial: dict[str, Any], *, default_factory=None)`

Holds application state. Supports nested dicts, lists, Pydantic models, and dataclasses.

```python
store = rs.Store({"items": [{"label": ""}], "user": UserModel(name="forman")})
store.get("user.name")          # "forman"
store.set("items[0].label", "foo")
```

Paths use a JSONPath-inspired syntax such as `user.name` or `items[3].label`.
By default, setting a path with a missing parent still raises the underlying
`KeyError`, `IndexError`, or `AttributeError`.

Pass `default_factory` to materialize missing path prefixes during
`set()`. The factory receives the missing prefix path as a tuple of path
segments and returns the value to insert there:

```python
def defaults(path: rs.path.Path):
    if path == (rs.path.Property("items"),):
        return []
    return {}


store = rs.Store({}, default_factory=defaults)
store.set("user.address.city", "Hamburg")
store.set("items[0].label", "foo")

store.get("user")   # {"address": {"city": "Hamburg"}}
store.get("items")  # [{"label": "foo"}]
```

Factories may return typed objects, too. RemoteState inserts the object and
then uses normal attribute assignment for the remaining path:

```python
def defaults(path: rs.path.Path):
    if path == (rs.path.Property("user"),):
        return UserModel(name="", address=AddressModel(city="", street=""))
    return {}


store = rs.Store({}, default_factory=defaults)
store.set("user.address.city", "Berlin")
```

`get()` never calls the factory. It remains side-effect free and returns
`None` for missing values unless called with `require=True`. For list paths,
`set()` can append at exactly the next index when a factory is configured;
sparse indexes still raise `IndexError`.

### `@action`

Declares a method that mutates the store. All `store.set()` calls are batched
and sent as one `action_result` update after the handler finishes. Nested
updates include only the exact paths that were written, not redundant parent
prefixes.

### `@query`

Declares a read-only method that returns a value. Store mutations are forbidden
inside queries.

### Built-in bridge methods

`Service` also provides built-in `get_state` and `set_state` methods for the
generic TypeScript bridge. `get_state` is a built-in query that reads a store
value by path, and `set_state` is the matching built-in action that writes one.
They power `useRemoteState()` and related helpers so simple UI state does not
need a custom service method for every path.

### `self.update_task(*, name, detail, progress)`

Reports progress of the current action or query to the frontend.

```python
@rs.query
async def process(self, path: str) -> dict:
    self.update_task(name="Loading data", progress=10)
    # ... do work ...
    self.update_task(name="Processing", progress=80)
    return result
```

### `rs.serve(service, *, ui_dist, mounts, app, open_browser, open_iframe, width, height, host, port, **uvicorn_settings)`

Starts the Remote State server and connects it to a frontend bundle.

| Parameter          | Default       | Description                                                    |
|--------------------|---------------|----------------------------------------------------------------|
| `service`          | required      | A `Service` instance                                           |
| `ui_dist`          | `None`        | Path to the React build output (`dist/`) or URL                |
| `mounts`           | `None`        | Mapping of endpoint paths to local directories or `StaticFiles` |
| `app`              | `None`        | [FastAPI](https://fastapi.tiangolo.com/) instance              |
| `open_browser`     | auto          | Open in browser, default outside Jupyter                       |
| `open_iframe`      | auto          | Render as IFrame, default in Jupyter                           |
| `width`            | `"100%"`      | IFrame width                                                   |
| `height`           | `400`         | IFrame height                                                  |
| `host`             | `"localhost"` | Server host                                                    |
| `port`             | `9753`        | Server port                                                    |
| `uvicorn_settings` | -             | Additional [uvicorn settings](https://uvicorn.dev/settings/)   |

Re-running the same Jupyter cell restarts the server automatically.

---

## TypeScript API

### `createRemoteStateClient<S>(url)`

Creates a typed RemoteState client.

```typescript
const client = createRemoteStateClient<MyService>("ws://localhost:9753/ws");
```

### `RemoteStateProvider` and client hooks

React context wrapper for a RemoteState client, plus hooks to access it. Provide
a WebSocket `url` for remote state, an externally-created `client`, or a
`fallback` factory that returns a local `RemoteStateClient`.

```tsx
<RemoteStateProvider url="ws://localhost:9753/ws">
  <App />
</RemoteStateProvider>

const client = useRemoteStateClient<MyService>();
```

If no `url`, `client`, or `fallback` is provided, the provider throws. Fallback
clients use the same reactive `store` contract as remote clients, so
`useRemoteState()` and `useRemoteStateValue()` continue to work in local mode.

### `useRemoteState<T>(path, initialValue?)`

React-like state hook backed by the Python store. It returns `[value, setValue]`.

```typescript
const [count, setCount] = useRemoteState<number>("count", 0);
await setCount((prev) => (prev ?? 0) + 1);
```

### `client.action(method, args?, kwargs?, options?)`

Calls a Python `@action`. Fire-and-forget by default.

```typescript
await client.action("increment");
await client.action("set_name", ["forman"]);
await client.action("save", [], {}, { awaitInvalidate: true });
```

### `client.query(method, args?, kwargs?, options?)`

Calls a Python `@query` and returns the result.

```typescript
const result = await client.query("compute", [2.5]);
```

### `useRemoteStateValue<T>(path)`

Low-level read hook for store values. Returns `undefined` while loading and
re-renders when its path, a parent path, or a child path changes.

---

## Development

### Prerequisites

- Python >= 3.12
- Node.js >= 20
- [pixi](https://pixi.sh) recommended, or pip + venv

### Setup

```bash
git clone https://github.com/bcdev/remotestate
cd remotestate

# Python
cd remotestate-py
pixi install
pixi run pytest

# TypeScript
cd ../remotestate-ts
npm install
npm run tests
npm run checks
```

### Running the demo frontend

```bash
# Build the TypeScript package first
cd remotestate-ts
npm install
npm run build

# Then start the demo frontend
cd ../remotestate-demo
npm install
npm run dev
```

---

## Architecture

```text
Python (source of truth)             TypeScript / React (renderer)
──────────────────────────────       ──────────────────────────────
Store                                StoreImpl (cache)
  state                         ──►    lazy fetch per path
  actions + queries             ──►    path updates -> re-render
  progress events               ──►    task updates

Service                              RemoteStateClient
  @action -> mutate state       ──►    client.action()
  @query  -> read state/result  ──►    client.query()

WebSocket transport
  ws://localhost:9753/ws
```

**Protocol messages (WebSocket, JSON):**

| Direction | Type | Purpose |
|---|---|---|
| JS -> PY | `get` | Fetch a single store value |
| JS -> PY | `action` | Call a `@action` method |
| JS -> PY | `query` | Call a `@query` method |
| PY -> JS | `get_result` | Response to `get` |
| PY -> JS | `action_result` | Batched exact-path store updates from an action |
| PY -> JS | `query_result` | Response to `query` |
| PY -> JS | `update_task` | Progress from `self.update_task()` |
| PY -> JS | `error` | Any error |

---

## Contributing

Contributions are very welcome. Please open an issue first to discuss larger changes.

```bash
# Run all tests
cd remotestate-py && pixi run pytest
cd remotestate-ts && npm run tests

# Lint
cd remotestate-py && pixi run ruff check src
cd remotestate-ts && npm run checks
```

Please follow the existing code style: Ruff format/check on the Python side,
ESLint and TypeScript strict mode on the JavaScript side.

---

## License

MIT © [@forman](https://github.com/forman)
