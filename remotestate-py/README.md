# RemoteState - Python Library

[![CI](https://github.com/bcdev/remotestate/actions/workflows/ci.yml/badge.svg)](https://github.com/bcdev/remotestate/actions/workflows/ci.yml)
[![PyPI version](https://img.shields.io/pypi/v/remotestate?logo=pypi)](https://pypi.org/project/remotestate/)
[![Python](https://img.shields.io/badge/Python-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![pydantic](https://img.shields.io/badge/pydantic-E92063?logo=pydantic&logoColor=white)](https://docs.pydantic.dev/)
[![Ruff](https://img.shields.io/badge/Ruff-2C2F3A?logo=ruff&logoColor=white)](https://docs.astral.sh/ruff/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

`remotestate` is the Python runtime for RemoteState apps. It owns the state store, service methods, and server that expose Python state to React.

If you want the high-level product overview, start with the repository root README:
[RemoteState](../README.md)

## Install

```bash
pip install remotestate
```

Or with [pixi](https://pixi.sh):

```bash
pixi add remotestate
```

## Development

- Python `>= 3.12`
- from the package directory: `cd remotestate-py`
- install dependencies with `pixi install`
- run tests with `pixi run tests`
- lint with `pixi run lint`
- format with `pixi run format`
- reorder imports with `pixi run isort`
- type-check with `pixi run mypy`
- build a wheel with `pixi run build`

## Quick Start

```python
import remotestate as rs


class CounterService(rs.Service):
    def __init__(self) -> None:
        super().__init__(rs.Store({"count": 0, "user": {"name": "forman"}}))

    @rs.action
    async def increment(self) -> None:
        self.store.set("count", self.store.get("count") + 1)

    @rs.query
    async def compute(self, x: float) -> float:
        self.notify(name="Computing", detail="reading current count", progress=50)
        return x * self.store.get("count")


rs.serve(CounterService(), ui_dist="my-ui/dist")
```

## API Overview

The public Python API is exported from `remotestate`:

- `Store`
- `Service`
- `ServeResult`
- `action`
- `query`
- `serve`
- `path`

## Store

`Store(initial, *, default_factory=None)` holds the Python-side application state.

- the root state may be any JSON-serializable value, including a mapping, list,
  scalar, Pydantic model, or dataclass
- nested dicts, lists, Pydantic models, and dataclasses are all supported
- `default_factory` receives the missing prefix as a `rs.path.Path` tuple

- `state` returns the current root state value
- `get(path=(), require=False)` reads a value from a path such as ``, `user.name`,
  `[0].label`, or `items[0].label`; omit `path` to read the root state value
- `set(path, value)` writes a value and notifies subscribers
- `store[path]` and `store[path] = value` are notebook-friendly aliases for
  `get()` and `set()`
- `subscribe(callback)` receives batched path-to-value updates after changes flush
- `default_factory` can materialize missing parents while setting nested values

```python
import remotestate as rs


class User:
    def __init__(self, name: str = "", city: str = "") -> None:
        self.name = name
        self.city = city


def defaults(path: rs.path.Path):
    if path == (rs.path.Property("user"),):
        return User()
    if path == (rs.path.Property("items"),):
        return []
    return {}


store = rs.Store({}, default_factory=defaults)
store.set("user.city", "Hamburg")
store.set("items[0].label", "foo")
store["items", 0, "label"] = "bar"

assert store.get("user.city") == "Hamburg"
assert store.get() is store.state
assert store["items"] == [{"label": "bar"}]
assert store[()] is store.state
```

`get()` never calls the default factory. Reads stay side-effect free, and missing 
values return `None` unless `require=True` is passed.

## Actions and Queries

Use `@action` for state-changing service methods and `@query` for read-only methods.

- `@action` batches `store.set()` calls and flushes them as one `action_result` message.
- `@query` is read-only; mutating the store inside a query raises `PermissionError`
- sync and async methods are both supported

```python
class Counter(rs.Service):
    def __init__(self) -> None:
        super().__init__(rs.Store({"count": 0}))

    @rs.action
    def increment(self) -> None:
        self.store.set("count", self.store.get("count") + 1)

    @rs.query
    async def multiply(self, x: float) -> float:
        self.notify(name="Working", progress=25)
        return x * self.store.get("count")
```

## Service Helpers

`Service` also provides built-in methods that power the generic TypeScript bridge:

- `get(path="")` reads a store value by path
- `set(path, value)` writes a store value by path
- `notify(name=None, detail=None, progress=None)` emits `update_task` progress messages 
  for tracked calls

The reserved service method names are `get`, `set`, and `notify`. Do not reuse those names 
for custom actions or queries.

`Service._init_app(app)` can be overridden to customize the FastAPI app when `serve()` 
creates one.

## Serving

`serve(service, *, ui_dist, mounts, app, display, width, height, host, port, **uvicorn_settings)` 
starts the RemoteState server and connects it to a frontend bundle.

- `service` is a `Service` instance
- `ui_dist` can be a local React build directory or an HTTP(S) URL
- `mounts` adds additional static paths
- `app` lets you supply your own FastAPI app
- `display` controls how the UI is shown: `"auto"`, `"browser"`, `"notebook"`, `"none"`, or a callback
- `host` and `port` configure the backend server

By default, RemoteState chooses a free port, opens a browser outside notebooks, and renders inline
inside notebooks. Re-running the same notebook cell restarts the server automatically.

`serve()` returns a `ServeResult` with the resolved URLs and server handles:

```python
result = rs.serve(CounterService(), ui_dist="my-ui/dist", display="none")

print("Server URL:    ", result.server_url)
print("WebSocket URL: ", result.ws_url)
print("UI Base URL:   ", result.ui_base_url)
```

## Paths

`remotestate.path` exposes the parsed path types used by `Store.default_factory` and other
advanced integrations:

- `Path`
- `Property`
- `Index`

RemoteState paths use a simplified [JSONPath](https://www.rfc-editor.org/info/rfc9535/) 
subset without the `"$."` prefix:

- the empty string addresses the root state value
- the first segment may be an identifier, bracketed integer index, or bracketed
  JSON string key
- later segments may be dotted identifiers, bracketed integer indices, or bracketed JSON string keys
- bracketed string keys may use either single or double quotes; canonical output uses double quotes
- the whole string must match the grammar; prefix parsing is not allowed

| Example                   | Valid? | Notes                                                 |
|---------------------------|--------|-------------------------------------------------------|
| empty string              | yes    | root state value                                      |
| `user`                    | yes    | root property shorthand                               |
| `[0].label`               | yes    | array root plus child property                        |
| `items[0].label`          | yes    | dotted identifier plus integer index                  |
| `["display name"].value`  | yes    | bracketed string key at the root                      |
| `user["display name"]`    | yes    | bracketed string key                                  |
| `$.user`                  | no     | `"$."` prefix is not part of the syntax               |
| `items[01]`               | no     | indices are canonical integers without leading zeroes |

Use `parse_path()` and `format_path()` when you need to inspect, validate, or construct paths.

## More Docs

- [Repository root README](../README.md)
- [TypeScript package README](../remotestate-ts/README.md)
