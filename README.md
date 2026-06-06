# 🥨 Remote State

> **Python state, React UI.** One runtime for notebook apps and addon backends.

Remote State is a Python-first framework for building stateful React frontends.
It lets you define application state, actions, and queries in Python, then
render the UI in React/TypeScript over a WebSocket bridge.

The library is designed around two primary use cases:

1. **React frontends for Python code** - especially notebook-driven UIs, where a Jupyter cell or Python script owns the state and the browser only renders the interface.
2. **Addon and plugin backends for frontend apps** - where a frontend addon can ship a TS/React UI and, optionally, a Python backend that provides server-side state, actions, and queries.

In both cases, Python is the source of truth for business state and behavior.
React handles presentation, interaction, and reactivity on the client.

---

## What Remote State Provides

- **Python-owned application state** - store nested state in a `Store` and mutate it through actions.
- **Read and write separation** - use `@action` for mutations and `@query` for read-only calls.
- **Reactive client caching** - the frontend fetches values lazily and re-renders when state changes.
- **Progress updates** - long-running actions and queries can emit progress events to the UI.
- **Notebook rendering** - show the UI inline in Jupyter or open it in a browser.
- **Addon-friendly architecture** - bundle a React UI and an optional Python backend behind one API surface.
- **Typed TypeScript client** - consume the backend from React with `createClient`, `ClientProvider`, and hooks.

---

## How It Fits Together

Remote State splits responsibilities cleanly:

- **Python** owns state, domain logic, actions, queries, and progress reporting.
- **TypeScript/React** owns rendering, local interaction, and typed client access.
- **WebSocket transport** connects both sides and carries state reads, invalidations, and task updates.

That makes the package useful both as a notebook UI runtime and as a backend layer for a frontend addon system.

---

## Quick Start

### Python backend

```python
import remotestate as rs

store = rs.Store(
    {
        "count": 0,
        "user": {"name": "Norman"},
    }
)


class MyService(rs.Service):
    @rs.action
    async def increment(self):
        self.store.set("count", self.store.get("count") + 1)

    @rs.query
    async def compute(self, x: float) -> float:
        self.progress(name="Computing...", progress=50)
        return x * self.store.get("count")


rs.serve(MyService(store), dist_dir="my-ui/dist")
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
import { ClientProvider, useClient, useState } from "remotestate";
import type { MyService } from "./MyService";

function AppInner() {
  const client = useClient<MyService>();
  const [count, setCount] = useState<number>("count", 0);
  const [name] = useState<string>("user.name");

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
    <ClientProvider url="ws://localhost:9753/ws">
      <AppInner />
    </ClientProvider>
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

### `Store(initial: dict)`

Holds application state. Supports nested dicts, lists, Pydantic models, and dataclasses.

```python
store = rs.Store({"items": [], "user": UserModel(name="Norman")})
store.get("user.name")          # "Norman"
store.set("items[0].label", "foo")
```

Paths use a JSONPath-inspired syntax such as `user.name` or `items[3].label`.

### `@action`

Declares a method that mutates the store. All `store.set()` calls are batched
and sent as one invalidation after the handler finishes.

### `@query`

Declares a read-only method that returns a value. Store mutations are forbidden
inside queries.

### `self.progress(*, name, detail, progress)`

Reports progress of the current action or query to the frontend.

```python
@rs.query
async def process(self, path: str) -> dict:
    self.progress(name="Loading data", progress=10)
    # ... do work ...
    self.progress(name="Processing", progress=80)
    return result
```

### `rs.serve(service, *, dist_dir, host, port, open_browser, open_iframe, iframe_height)`

Starts the Remote State server and connects it to a frontend bundle.

| Parameter | Default | Description |
|---|---|---|
| `service` | required | A `Service` instance |
| `dist_dir` | `None` | Path to the React build output (`dist/`) |
| `host` | `"localhost"` | Server host |
| `port` | `9753` | Server port |
| `open_browser` | auto | Open in browser, default outside Jupyter |
| `open_iframe` | auto | Render as IFrame, default in Jupyter |
| `iframe_height` | `600` | IFrame height in pixels |

Re-running the same Jupyter cell restarts the server automatically.

---

## TypeScript API

### `createClient<TService>(url)`

Creates a typed Remote State client.

```typescript
const client = createClient<MyService>("ws://localhost:9753/ws");
```

### `ClientProvider` and `useClient<TService>()`

React context wrapper for a client bound to a WebSocket URL, plus a hook to
access it.

```tsx
<ClientProvider url="ws://localhost:9753/ws">
  <App />
</ClientProvider>

const client = useClient<MyService>();
```

### `useState<T>(path, initialValue?)`

React-like state hook backed by the Python store. It returns `[value, setValue]`.

```typescript
const [count, setCount] = useState<number>("count", 0);
await setCount((prev) => (prev ?? 0) + 1);
```

### `client.action(method, args?, kwargs?, options?)`

Calls a Python `@action`. Fire-and-forget by default.

```typescript
await client.action("increment");
await client.action("set_name", ["Norman"]);
await client.action("save", [], {}, { awaitInvalidate: true });
```

### `client.query(method, args?, kwargs?, options?)`

Calls a Python `@query` and returns the result.

```typescript
const result = await client.query("compute", [5.0]);
```

### `useStateValue<T>(path)`

Low-level read hook for store values. Returns `undefined` while loading and
re-renders on invalidation.

---

## Development

### Prerequisites

- Python >= 3.11
- Node.js >= 18
- [pixi](https://pixi.sh) recommended, or pip + venv

### Setup

```bash
git clone https://github.com/your-username/remotestate
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

### Running the dev example

```bash
# Terminal 1 - Python server
cd examples/basic
pixi run python server.py

# Terminal 2 - Vite dev server
cd examples/basic/ui
npm run dev
```

### Generating a TypeScript interface from Python

```bash
remotestate generate my_service.py --out ui/src/MyService.ts
```

---

## Architecture

```text
Python (source of truth)           TypeScript / React (renderer)
──────────────────────────────     ──────────────────────────────
Store                          StoreImpl (cache)
  state                             lazy fetch per path
  actions + queries            ──►    invalidate -> re-render
  progress events               ──►    task updates

Service
  @action -> mutate state       ──►  client.action()
  @query  -> read state/result  ──►  client.query()

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
| PY -> JS | `invalidate` | Batch store update |
| PY -> JS | `query_result` | Response to `query` |
| PY -> JS | `task_update` | Progress from `self.progress()` |
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

Please follow the existing code style: ruff + black on the Python side, ESLint
and TypeScript strict mode on the JavaScript side.

---

## License

MIT © Norman Fomferra
