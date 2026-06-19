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
