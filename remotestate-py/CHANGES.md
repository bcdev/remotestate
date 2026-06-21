## Version 0.3.0 (in development)

- `Store` now accepts any root state value, exposes it through the typed
  `state` property, and supports root reads/writes with the empty path.
- `Store.get()` now defaults to the root state value when no path is passed.
- Removed the built-in `Service.get()` query and `Service.set()` action.
  Store reads and writes now use dedicated `get`/`set` protocol messages, while
  service actions and queries are reserved for domain methods.
- `Service` is now generic over the root state type, so `service.store`
  preserves the `Store[T]` type.
- Added notebook-friendly `Store.__getitem__()` and `Store.__setitem__()`
  aliases:
  - `store["items[0].label"]` uses RemoteState string path syntax.
  - `store["items", 0, "label"]` uses tuple path segments.
  - `store[()]` addresses the root state value.
- Relaxed the path grammar so the empty string addresses the root value and
  paths may start with a bracketed array index or string key, such as
  `[0].label` or `["display name"].value`.
- Updated JSONPath conversion helpers so `""` maps to `$` and `[0]` maps to
  `$[0]`.
- Added public `PathInput` and `PathSegmentInput` aliases plus
  `normalize_path()` and `normalize_path_segment()` helpers under
  `remotestate.path`.
- Removed the Python-only `Property` and `Index` parsed path segment classes.
  Parsed paths now use primitive tuple segments, such as `("items", 0,
  "label")`, matching the TypeScript path model.
- Aligned `PathInput` with TypeScript: pass a string path or a sequence of
  path segments. Root array entries can be addressed as `"[0]"` or `(0,)`.


## Version 0.2.0

- Tightened the shared path grammar to a strict JSONPath subset without the
  `$.` prefix:
  - Root paths must start with an identifier.
  - Later segments may use dotted identifiers, bracketed integer indices, or
    bracketed string keys.
  - Bracketed string keys may use either single or double quotes; formatting
    stays canonical with double quotes.
  - Invalid paths now fail explicitly instead of silently returning a parsed
    prefix.
- Added `format_path()` as the public Python path formatter.
- Updated parser docstrings, README examples, and path tests to match the
  shared grammar.
- Added `twine` to dev-dependencies.
- Changed member names in the `Service` class:
  - `init_app` to `_init_app`
  - `get_state` to `get`
  - `set_state` to `set`
  - `update_task` to `notify`
- Added `__version__` attribute to main package.
- Exposed the `path` submodule from the package root and moved `Path`,
  `PathSegment`, `Property`, and `Index` under `remotestate.path`.
- Changed the `Store` default factory API:
  - Renamed the keyword argument from `default_value_factory` to
    `default_factory`.
  - The factory now receives a parsed `Path` tuple instead of a path string.
- Changed store update notifications to emit only the exact paths written by
  `Store.set()`, instead of also including all parent prefixes.
- Broadcast Python-side `Store.set()` updates to connected WebSocket clients
  even when the mutation did not originate from a JavaScript action.
- Changed signature and behavior of `serve()` function:
  - Replaced `open_browser` and `open_iframe` with a generic `display`
    parameter.
  - `serve()` now returns a `ServeResult` with resolved server, WebSocket,
    and UI URLs.
  - Renamed `iframe_heigh` argument into `height`, and added `width`.
  - It is no longer using FastAPI/Uvicorn default
    logging. Instead, all server logs are written to `server.log` 
    and logging to stdout/stderr is suppressed.


## Version 0.1.0

Initial release from 2026-06-09.
