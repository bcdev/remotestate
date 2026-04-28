# 🥨 zwieback

> **Twice baked.** Once in Python, once in TypeScript.

Zwieback is a lightweight framework for building reactive UIs where 
**all state and logic live in Python** — only the rendering happens in the browser. 
Write your backend in Python, your frontend in React, 
and let zwieback handle the rest.
---

## ✨ Why zwieback?

- **Python is the single source of truth** — your entire app state lives in a `Store`, no synchronization hell
- **Reactive without duplication** — the JS client caches values lazily and invalidates on change, no duplicate state in the browser
- **Actions and queries** — decorate Python methods with `@action` (mutates state) or `@query` (read-only, returns a value)
- **Progress reporting** — long-running queries can push progress updates to the UI via `self.progress()`
- **Works in Jupyter** — renders as an IFrame in JupyterLab, zero extra config
- **Works standalone** — serves a React app from a local FastAPI server, opens in your browser
- **Minimal React API** — `ClientProvider`, `useClient`, and `useStateValue`, with typed `client.action/query` calls
- **TypeScript-first** — generate a typed service interface from your Python class, get full autocompletion

---

## 🚀 Quick start

### Python

```python
import zwieback as zw

store = zw.Store({
    "count": 0,
    "user": {"name": "Norman"},
})

class MyService(zw.Service):
    @zw.action
    async def increment(self):
        self.store.set("count", self.store.get("count") + 1)

    @zw.query
    async def compute(self, x: float) -> float:
        self.progress(name="Computing...", progress=50)
        return x * self.store.get("count")

zw.serve(MyService(store), dist_dir="my-ui/dist")
```

### TypeScript / React

```typescript
// MyService.ts — define your service contract (can be handwritten)
export interface MyService {
  increment(): Promise<void>;
  compute(x: number): Promise<number>;
}
```

```tsx
import { ClientProvider, useClient, useStateValue } from "zwieback";
import type { MyService } from "./MyService";

function AppInner() {
  const client = useClient<MyService>();
  const count = useStateValue<number>("count");
  const name = useStateValue<string>("user.name");

  return (
    <div>
      <p>Hello, {name ?? "..."}! Count: {count ?? "..."}</p>
      <button onClick={() => void client.action("increment")}>+1</button>
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

## 📦 Installation

### Python

```bash
pip install zwieback
```

Or with [pixi](https://pixi.sh):

```bash
pixi add zwieback
```

### TypeScript / React

```bash
npm install zwieback
```

---

## 🗂 Project structure

A typical zwieback project looks like this:

```
my-project/
  my_service.py        # Python store + service
  notebook.ipynb       # or a plain Python script
  my-ui/
    src/
      MyService.ts     # generated or handwritten TS interface
      App.tsx          # your React UI
    dist/              # built by vite, served by zwieback
```

---

## 🔌 API reference

### Python

#### `Store(initial: dict)`
Holds all application state. Supports nested dicts, lists, Pydantic models, and dataclasses.

```python
store = zw.Store({"items": [], "user": UserModel(name="Norman")})
store.get("user.name")          # "Norman"
store.set("items[0].label", "foo")
```

Paths follow a JSONPath-inspired syntax: `user.name`, `items[3].label`. No wildcards.

#### `@action`
Decorates a method that mutates the store. All `store.set()` calls are batched and sent as a single invalidation at the end of the handler. Both sync and async methods are supported.

#### `@query`
Decorates a read-only method that returns a value. Store mutations are forbidden inside queries. Both sync and async methods are supported.

#### `self.progress(*, name, detail, progress)`
Reports progress of the current action or query to the frontend. Fire-and-forget.

```python
@zw.query
async def process(self, path: str) -> dict:
    self.progress(name="Loading data", progress=10)
    # ... do work ...
    self.progress(name="Processing", progress=80)
    return result
```

#### `zw.serve(service, *, dist_dir, host, port, open_browser, open_iframe, iframe_height)`
Starts the zwieback server and displays the UI.

| Parameter | Default | Description |
|---|---|---|
| `service` | required | A `Service` instance |
| `dist_dir` | `None` | Path to the React build output (`dist/`) |
| `host` | `"localhost"` | Server host |
| `port` | `9753` | Server port |
| `open_browser` | auto | Open in browser (default outside Jupyter) |
| `open_iframe` | auto | Render as IFrame (default in Jupyter) |
| `iframe_height` | `600` | IFrame height in pixels |

Re-executing the same Jupyter cell restarts the server automatically.

---

### TypeScript

#### `createClient<TService>(url)`
Creates a typed zwieback client.

```typescript
const client = createClient<MyService>("ws://localhost:9753/ws");
```

#### `ClientProvider` + `useClient<TService>()`
React context wrapper for a client bound to a WebSocket URL, plus hook to access it.

```tsx
<ClientProvider url="ws://localhost:9753/ws">
  <App />
</ClientProvider>

const client = useClient<MyService>();
```

#### `useStateValue<T>(path)`
React hook for store values. Returns `undefined` while loading and re-renders on invalidation.

```typescript
const count = useStateValue<number>("count");
```

#### `client.action(method, args?, kwargs?, options?)`
Calls a Python `@action`. Fire-and-forget by default.

```typescript
await client.action("increment");
await client.action("set_name", ["Norman"]);
await client.action("save", [], {}, { awaitInvalidate: true });
```

#### `client.query(method, args?, kwargs?, options?)`
Calls a Python `@query` and returns the result.

```typescript
const result = await client.query("compute", [5.0]);
```

---

## 🛠 Development

### Prerequisites

- Python ≥ 3.11
- Node.js ≥ 18
- [pixi](https://pixi.sh) (recommended) or pip + venv

### Setup

```bash
git clone https://github.com/your-username/zwieback
cd zwieback

# Python
cd zwieback-py
pixi install
pixi run pytest

# TypeScript
cd ../zwieback-ts
npm install
npm test
npm run checks
```

### Running the dev example

```bash
# Terminal 1 — Python server
cd examples/basic
pixi run python server.py

# Terminal 2 — Vite dev server
cd examples/basic/ui
npm run dev
```

### Generating a TypeScript interface from Python

```bash
zwieback generate my_service.py --out ui/src/MyService.ts
```


---

## 🧱 Architecture

```
Python (server)                    TypeScript (browser)
──────────────────────────────     ──────────────────────────────
Store                          StoreImpl (cache)
  state (single source of truth)     lazy fetch per path
  set() → batch updates        ──►    invalidate → re-render

Service
  @action → mutates store     ──►  client.action()
  @query  → read-only result  ──►  client.query() → Promise
  progress()                  ──►  task_update messages

FastAPI + WebSocket
  ws://localhost:9753/ws
```

**Protocol messages (WebSocket, JSON):**

| Direction | Type | Purpose |
|---|---|---|
| JS → PY | `get` | Fetch a single store value |
| JS → PY | `action` | Call a `@action` method |
| JS → PY | `query` | Call a `@query` method |
| PY → JS | `get_result` | Response to `get` |
| PY → JS | `invalidate` | Batch store update |
| PY → JS | `query_result` | Response to `query` |
| PY → JS | `task_update` | Progress from `self.progress()` |
| PY → JS | `error` | Any error |

---

## 🤝 Contributing

Contributions are very welcome! Please open an issue first to discuss larger changes.

```bash
# Run all tests
cd zwieback-py && pixi run pytest
cd zwieback-ts && npm test

# Lint
cd zwieback-py && pixi run ruff check src
cd zwieback-ts && npm run checks
```

Please follow the existing code style — ruff + black on the Python side, ESLint + TypeScript strict on the JS side.

---

## 📄 License

MIT © Norman Fomferra
