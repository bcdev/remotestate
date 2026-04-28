# zwieback — Python/React Bridge

> **Twice baked.** Once in Python, once in TypeScript.

Zwieback is a lightweight framework for building reactive UIs where 
**all state and logic live in Python** — only the rendering happens in the browser. 
Write your backend in Python, your frontend in React, 
and let zwieback handle the rest.

## Vision

A lightweight bridge between Python and React, allowing developers to build
React UIs with Python backends. Event handlers and state live in Python;
the React UI is pure TS/JS. Renders inside Jupyter notebooks
(as IFrame) or as a standalone app.

The Python backend library is located in `./zwieback-py`, 
the React/TS frontend library in `-/zwieback-ts`.

## Usage (target API)

### Python

```python
import pyre

store = pyre.PythonStore({
    "user": {"name": "Norman"},
    "items": [],
    "count": 0,
})


class MyService(pyre.PythonService):
    @pyre.action
    async def increment(self):
        self.store.set("count", self.store.get("count") + 1)

    @pyre.action
    async def set_name(self, name: str):
        self.store.set("user.name", name)

    @pyre.query
    async def compute(self, x: float) -> float:
        return x * self.store.get("factor")


pyre.show(MyService(store), ui_dist_path="zwieback-ts/dist")
```

### TypeScript/React

```typescript
const pyre = createPyreClient("ws://localhost:9753/ws")

function App() {
    const count = pyre.useStore<number>("count")
    const label = pyre.useStoreSelector(
        ["user.name", "user.age"],
        (name, age) => `${name} (${age})`
    )
    return (
        <button onClick={() => pyre.action("increment")}>
            {count}
        </button>
    )
}
```

## Architecture

### State Flow

```
User clicks button
  → JS calls pyre.action("increment")
  → Python @action runs, mutates PythonStore
  → Store batches all mutations in handler scope
  → Handler finishes → single InvalidateMessage broadcast
  → JS cache updated → React re-renders
```

### Key Design Decisions

- **Python is single source of truth** — no duplicate state in JS
- **JS cache is lazy** — values fetched on demand via GetMessage, invalidated via InvalidateMessage
- **Batch invalidation** — all store mutations in one @action are flushed as a single InvalidateMessage at the end
- **@action vs @query** — actions mutate store (no return value), queries are read-only (have return value)
- **Sync and async handlers both supported** — sync handlers are wrapped automatically
- **ContextVar for read-only guard** — queries get a read-only store enforced via ContextVar, async-safe
- **Thread-safe queue** — store updates use `queue.Queue(timeout=)` between Jupyter kernel thread and uvicorn event loop thread

### Pyre Path Syntax

JSONPath subset without `$.` prefix:

```
user.name           # object property
items[3]            # array index
items[3].name       # combined
```

- Only dot notation and integer indices — no wildcards, no filters
- Set operations automatically invalidate all prefix paths:
  `set("items[3].name")` invalidates `items[3].name`, `items[3]`, `items`
- Convert to/from JSONPath: prepend/strip `$.`

### Protocol (WebSocket, JSON)

JS → Python:

```typescript
{ type: "get",    id, path }                    // fetch single value
{ type: "call",   id, method, args, kwargs }    // @action, fire-and-forget
{ type: "invoke", id, method, args, kwargs }    // @query, expects result
```

Python → JS:

```typescript
{ type: "value",         id, path, value }      // response to "get"
{ type: "invalidate",    updates }              // Record<path, value>
{ type: "invoke_result", id, value }            // response to "invoke"
{ type: "error",         id, message }          // any error
```

## Project Structure

```
zwieback/
  zwieback-py/              # Python package
    src/pyre/
      context.py            # _readonly_store ContextVar
      path.py               # PyrePath parser (Property, Index, prefixes)
      protocol.py           # Pydantic message models
      store.py              # PythonStore, _batch_pending_updates
      service.py            # PythonService, @action, @query
      server.py             # PyreServer, WebSocketTransport, FastAPI app
      show.py               # show() entrypoint
    tests/
      path_test.py
      store_test.py
      service_test.py
      server_test.py

zwieback-ts/                # TypeScript/React package (name: "pyre")
    src/
      lib/                  # library code (built by vite lib mode)
        protocol.ts
        transport.ts        # WebSocket + reconnect + pending queue
        store.ts            # PyreStore, useStore<T>
        selector.ts         # useStoreSelector (reselect-style memoizing)
        service.ts          # action/query proxy
        index.ts            # public API
      dev/                  # dev/test app (not shipped)
        main.tsx
        App.tsx
    index.html              # dev entrypoint
    vite.config.ts
    tsconfig.json
    eslint.config.js
```

## Stack

### Python

- **pydantic** — protocol message models + state validation
- **fastapi** — WebSocket server + static file serving
- **uvicorn** — ASGI server, runs in daemon thread
- **pytest + pytest-asyncio** — tests
- **pixi** — environment management

### TypeScript

- **vite** — dev server + lib build
- **react 19** — UI
- **typescript strict** — no implicit any
- **eslint** — no explicit any, semicolons required, curly braces required

## Current Status

Python side is complete and tested:

- [x] Path parser
- [x] Protocol (Pydantic models)
- [x] PythonStore (get/set, subscribe, batch, pydantic support)
- [x] PythonService (@action, @query, _pyre_invoke_action, _pyre_invoke_query)
- [x] PyreServer (WebSocket, FastAPI, thread-safe queue broadcaster)
- [x] show()

TypeScript side in progress:

- [x] protocol.ts
- [x] transport.ts (WebSocket + reconnect + pending requests)
- [x] store.ts (PyreStore, useStore<T>)
- [ ] selector.ts
- [ ] service.ts
- [ ] index.ts
