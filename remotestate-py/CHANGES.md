## Version 0.1.1 (in development)

- Added `twine` to dev-dependencies.
- Added `__version__` attribute to main package.
- Changed signature and behavior of `serve()` function:
  - Renamed `iframe_heigh` argument into `height`, and added `width`.
  - It is no longer using FastAPI/Uvicorn default
    logging. Instead, all server logs are written to `server.log` 
    and logging to stdout/stderr is suppressed.


## Version 0.1.0

Initial release from 2026-06-09.
