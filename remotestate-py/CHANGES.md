## Version 0.2.0 (in development)

- Added `twine` to dev-dependencies.
- Added `__version__` attribute to main package.
- Exposed the `path` submodule from the package root and moved `Path`,
  `PathSegment`, `Property`, and `Index` under `remotestate.path`.
- Changed the `Store` default factory API:
  - Renamed the keyword argument from `default_value_factory` to
    `default_factory`.
  - The factory now receives a parsed `Path` tuple instead of a path string.
- Changed action-result protocol payloads from repeated prefix snapshots to
  compact JSON Patch-style cache operations.
- Changed signature and behavior of `serve()` function:
  - Renamed `iframe_heigh` argument into `height`, and added `width`.
  - It is no longer using FastAPI/Uvicorn default
    logging. Instead, all server logs are written to `server.log` 
    and logging to stdout/stderr is suppressed.


## Version 0.1.0

Initial release from 2026-06-09.
