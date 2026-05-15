# zwieback-py To-Dos

## New Features

- [x] Allow serving the UI app from the known URL when running the HTTP dev server
  serving the Reaact/TypeScript dev app. 
    - `ui_dist` passed to `serve()` can be a URL.
    - Include WebSocket URL as query parameter `ws` in opened IFRAME / browser tab.

- [x] Allow enhancing the FastAPI apps by new (HTTP) routes, e.g., to allow for
  adding an extra REST API. 

- [ ] We currently require a user's `Service` query and action methods to 
  accept and return JSON data only. Since we use Pydantic, `pydantic.BaseClass`
  arguments and return values should be handled by default. Allow for custom
  serielizer/deserializers later (per-service and per-method).

- [ ] Allow calling user `Service` methods on the created `Service` instance.
  but including their reactive behavior.
  For this to work, `@action` and `@query` decorators must return wrapped
  versions of the function that invoke them like if the `action` or `query`
  came from the frontend. 
  (Nice, even `task_id` would work with a little effort!)
  Care: If an action calls actions or queries or a query calls queries the 
  original method must be called, not the wrapped, reactive version.

## Bugs

- [x] If `ui_dist` passed to `serve()` is a URL, the UI won't work although the 
  correct WebSocket URL is passed as query parameter `ws` in opened IFRAME.

## Refactorings

- [x] Rename protocol `id` to `call_id`
- [x] Rename protocol `tid` to `task_id`
- [x] Rename `InvalidateMessage` to `ActionResultMessage`
- [x] Rename `"invalidate"` message to `"action_result"`  
- [x] Rename `Service.process` to `Service.update_task` 
- [x] Rename `"task_update"` to `"update_task"` 

## Improve error handling 

- [ ] Review Server and Service classes
- [ ] Visit all critical paths: log or raise or both?
- [ ] Include traceback in `ErrorMessage`

## State equality

- [ ] Only include values in TaskUpdateMessage that changed. Use `==` by default. 
      Ensure `InvalidatetMessage` is always sent, even if there are no updates.
- [ ] Allow passing custom equality checks, register `f(a, b): bool` 
      using state path as key.

## State serialization

- [ ] Register JSON codec or Pydantic class using state path as key

## State validation

- [ ] Register OpenAPI/JSON schema or Pydantic class using state path as key.
- [ ] Use schema validate before setting a value 

## Performance

- [ ] Check code for obvious optimization options
- [ ] Check code for potential performance limitation issues
- [ ] Check if we can compress request/response sizes, e.g., 
      have a special binary format for (numpy-like) array data 
      and (pandas-like) data frames.  
- [ ] Maybe throttle number emitted TaskUpdateMessage / time
- [ ] Was using WebSockets + JSON the right decision?

## CI

- [ ] Enhance quality checks, e.g., use mypy or similar
- [ ] Create and configure GitHub actions

# zwieback-py Ideas

## Add-on project: TS interface generation

- [ ] A CLI tool to generate a typescript interface and service factory 
      from a given Python `Service` implementation. The service factory creates
      a 1:1 TS version of the Python service.

## Add-on project: UI generation

- [ ] Allow for UI generation from OpenAPI/JSON schema. 
      FieldFactory interface: Neutral w.r.t. UI lib
